import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureUserOnly } from "../middlewares/ensureUserOnly";
import { notifyUser } from "../services/notify.service";
import { notifyGameBackAvailable } from "../services/gameAvailability.service";
import { getHolidaysByYear } from "../services/holiday.service";
import {
  canClientRentTier,
  incrementRentalCountAndMaybePromote,
} from "../services/category.service";
// 👇 Importando as novas regras de negócio do sistema de gamificação
import {
  applyCancellationPenalty,
  applyRentalReturnPoints,
} from "../services/engagement.service";

export const rentalRoutes = Router();

function toISODateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// =======================================================
// POST: Criar Reserva (Com Auto-Assign)
// =======================================================
rentalRoutes.post("/", ensureAuthenticated, ensureUserOnly, async (req, res) => {
  const userId = req.user.id;

  const { gameId, copyId, startDateIso, endDateIso } = req.body;

  if (!gameId || !startDateIso || !endDateIso) {
    return res.status(400).json({ error: "gameId, startDateIso e endDateIso são obrigatórios" });
  }

  const startDate = new Date(startDateIso);
  const endDate = new Date(endDateIso);
  const now = new Date();

  // 1. Validações de Tempo Básico
  if (startDate >= endDate) {
    return res.status(400).json({ error: "A devolução deve ocorrer após a retirada." });
  }

  if (startDate < now) {
    return res.status(400).json({ error: "Não é possível agendar reservas no passado." });
  }

  const startDay = startDate.getDay();
  const endDay = endDate.getDay();

  if (startDay === 0 || startDay === 6 || endDay === 0 || endDay === 6) {
    return res.status(400).json({ error: "A biblioteca funciona apenas de segunda a sexta-feira." });
  }

  const startHour = startDate.getHours();
  const endHour = endDate.getHours();

  if (startHour < 8 || startHour >= 19 || endHour < 8 || endHour > 19) {
    return res.status(400).json({ error: "Horário de agendamento fora do funcionamento (08h às 19h)." });
  }

  // 2. Validações de Feriados
  const holidays = await getHolidaysByYear(startDate.getFullYear());
  const startStr = toISODateString(startDate);
  const endStr = toISODateString(endDate);

  if (holidays.includes(startStr)) {
    return res.status(400).json({ error: "A data de retirada cai em um feriado. A biblioteca estará fechada." });
  }
  if (holidays.includes(endStr)) {
    return res.status(400).json({ error: "A data de devolução cai em um feriado. A biblioteca estará fechada." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // ==========================================
      // REGRAS DO USUÁRIO
      // ==========================================
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, clientCategory: true },
      });

      if (!user) {
        return { status: 404, body: { error: "Usuário não encontrado" } } as const;
      }

      if (user.clientCategory === "STARTER") {
        const isSameDay =
          startDate.getFullYear() === endDate.getFullYear() &&
          startDate.getMonth() === endDate.getMonth() &&
          startDate.getDate() === endDate.getDate();

        if (!isSameDay) {
          return {
            status: 400,
            body: { error: "Usuários STARTER devem agendar a devolução para o mesmo dia da retirada." }
          } as const;
        }
      }

      const activeCount = await tx.rental.count({
        where: {
          userId,
          status: { in: ["PENDING", "ACTIVE"] },
        },
      });

      if (activeCount >= 2) {
        return {
          status: 409,
          body: { error: "Você já possui 2 aluguéis em aberto.", code: "RENTAL_LIMIT_REACHED" },
        } as const;
      }

      // ==========================================
      // VALIDAÇÕES DO JOGO E CATEGORIA
      // ==========================================
      const game = await tx.game.findUnique({
        where: { id: String(gameId) },
        select: {
          id: true, title: true, cover: true, available: true,
          allowOriginalRental: true, isActive: true, isVisible: true, tier: true,
        },
      });

      if (!game || !game.isActive || !game.isVisible) {
        return { status: 404, body: { error: "Jogo não encontrado" } } as const;
      }

      if (game.tier) {
        const allowed = canClientRentTier(user.clientCategory, game.tier);
        if (!allowed) {
          return {
            status: 403,
            body: { error: "Sua categoria não permite alugar este jogo.", code: "TIER_ACCESS_DENIED" },
          } as const;
        }
      }

      // ==========================================
      // LÓGICA DE DISTRIBUIÇÃO (AUTO-ASSIGN)
      // ==========================================
      const availableCopies = await tx.gameCopy.findMany({
        where: { gameId: game.id, available: true }
      });

      const overlappingRentals = await tx.rental.findMany({
        where: {
          gameId: game.id,
          status: { in: ["PENDING", "ACTIVE"] },
          startDate: { lt: endDate },
          endDate: { gt: startDate }
        },
        select: { copyId: true }
      });

      const takenCopyIds = overlappingRentals.map(r => r.copyId);
      const isOriginalTaken = takenCopyIds.includes(null);

      let assignedCopyId: string | null | undefined = undefined;

      if (copyId) {
        if (takenCopyIds.includes(String(copyId))) {
          return { status: 409, body: { error: "Este exemplar já está reservado no horário selecionado.", code: "TIME_SLOT_TAKEN" } } as const;
        }
        assignedCopyId = String(copyId);
      } else {
        if (game.allowOriginalRental && game.available && !isOriginalTaken) {
          assignedCopyId = null; 
        } else {
          const freeCopy = availableCopies.find(c => !takenCopyIds.includes(c.id));
          if (freeCopy) {
            assignedCopyId = freeCopy.id;
          }
        }
      }

      if (assignedCopyId === undefined) {
        return { status: 409, body: { error: "Todos os exemplares deste jogo já estão reservados neste horário.", code: "TIME_SLOT_TAKEN" } } as const;
      }

      let copyCodeSnapshot = null;
      let copyNumberSnapshot = null;

      if (assignedCopyId !== null) {
        const selectedCopy = availableCopies.find(c => c.id === assignedCopyId);
        if (selectedCopy) {
          copyCodeSnapshot = selectedCopy.code;
          copyNumberSnapshot = selectedCopy.number;
        }
      }

      const rental = await tx.rental.create({
        data: {
          userId,
          gameId: game.id,
          copyId: assignedCopyId, 
          startDate,
          endDate,
          status: "PENDING",
          gameTitleSnapshot: game.title,
          gameCoverSnapshot: game.cover ?? null,
          copyCodeSnapshot,
          copyNumberSnapshot
        },
      });

      return { status: 201, body: rental } as const;
    });

    if (result.status === 201 && "id" in result.body) {
      await incrementRentalCountAndMaybePromote(userId);

      const game = await prisma.game.findUnique({
        where: { id: String(gameId) },
        select: { title: true },
      });

      await notifyUser({
        userId,
        type: "RENTAL_CREATED",
        title: "Reserva Confirmada 🎲",
        body: `Sua reserva de "${game?.title}" foi agendada!`,
        channelId: "rentals",
      });
    }

    return res.status(result.status).json(result.body);

  } catch (err) {
    console.error("Erro ao agendar aluguel:", err);
    return res.status(500).json({ error: "Erro interno ao processar agendamento." });
  }
});

// =======================================================
// GET: Listar Meus Aluguéis
// =======================================================
rentalRoutes.get("/me", ensureAuthenticated, async (req, res) => {
  try {
    const rentals = await prisma.rental.findMany({
      where: { userId: req.user.id },
      orderBy: { startDate: "desc" },
      include: {
        game: {
          select: { id: true, title: true, cover: true, isActive: true, isVisible: true },
        },
        copy: {
          select: { id: true, code: true, number: true },
        },
      },
    });

    const mapped = rentals.map((r) => ({
      ...r,
      game: r.game
        ? r.game
        : {
            id: null,
            title: r.gameTitleSnapshot,
            cover: r.gameCoverSnapshot,
            isActive: false,
            isVisible: false,
          },
      copy: r.copy
        ? r.copy
        : r.copyCodeSnapshot || r.copyNumberSnapshot
        ? { id: null, code: r.copyCodeSnapshot, number: r.copyNumberSnapshot }
        : null,
    }));

    return res.json(mapped);
  } catch (err) {
    console.error("Erro ao listar aluguéis:", err);
    return res.status(500).json({ error: "Erro ao listar aluguéis" });
  }
});

// =======================================================
// PATCH: Cancelar Reserva (Com Punição por Ghosting)
// =======================================================
rentalRoutes.patch("/:id/cancel", ensureAuthenticated, ensureUserOnly, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const rental = await prisma.rental.findUnique({
      where: { id: String(id) },
      include: {
        game: { select: { id: true, title: true } },
        copy: { select: { id: true } },
      },
    });

    if (!rental || rental.userId !== userId) {
      return res.status(404).json({ error: "Aluguel não encontrado." });
    }

    if (rental.status !== "PENDING") {
      return res.status(409).json({
        error: "Só é possível cancelar um aluguel que ainda está pendente.",
        code: "ONLY_PENDING_CAN_CANCEL",
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      return await tx.rental.update({
        where: { id: rental.id },
        data: { status: "CANCELED" },
        include: {
          game: { select: { id: true, title: true, cover: true } },
          copy: { select: { id: true, code: true, number: true } },
        },
      });
    });

    // 👇 APLICA A PENALIDADE DE PONTOS POR CANCELAR A RESERVA (GHOSTING)
    try {
      await applyCancellationPenalty(userId);
    } catch (penaltyErr) {
      console.error("Erro ao aplicar penalidade de cancelamento:", penaltyErr);
    }

    try {
      await notifyUser({
        userId,
        type: "SYSTEM_ANNOUNCEMENT",
        title: "Aluguel cancelado",
        body: `Seu aluguel de "${rental.game?.title || rental.gameTitleSnapshot}" foi cancelado com sucesso.`,
        channelId: "rentals",
        data: { route: "/rentals", rentalId: rental.id },
      });
    } catch (err) {
      console.error("Erro ao notificar cancelamento:", err);
    }

    try {
      if (rental.gameId) {
        await notifyGameBackAvailable(rental.gameId);
      }
    } catch (err) {
      console.error("Erro ao avisar disponibilidade após cancelamento:", err);
    }

    const finalMapped = {
      ...updated,
      game: updated.game
        ? updated.game
        : { id: null, title: updated.gameTitleSnapshot, cover: updated.gameCoverSnapshot },
      copy: updated.copy
        ? updated.copy
        : updated.copyCodeSnapshot || updated.copyNumberSnapshot
        ? { id: null, code: updated.copyCodeSnapshot, number: updated.copyNumberSnapshot }
        : null,
    };

    return res.json(finalMapped);
  } catch (err) {
    console.error("Erro ao cancelar aluguel:", err);
    return res.status(500).json({ error: "Erro ao cancelar aluguel." });
  }
});

// =======================================================
// PATCH: Finalizar / Devolver (Com Cálculo de Pontos de Tier/Atraso)
// =======================================================
rentalRoutes.patch("/:id/finish", ensureAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    const rental = await prisma.rental.findUnique({
      where: { id: String(id) },
      // 👇 Precisamos buscar o game para saber o 'tier' (peso do jogo) na hora de dar os pontos
      include: {
        game: { select: { tier: true } }
      }
    });

    if (!rental) {
      return res.status(404).json({ error: "Aluguel não encontrado" });
    }

    if (rental.status !== "ACTIVE") {
      return res.status(409).json({
        error: "Só pode finalizar aluguel ativo",
      });
    }

    // 👇 Verifica se a devolução está atrasada (Data Atual > Data Combinada)
    const isLate = new Date() > new Date(rental.endDate);

    const updated = await prisma.rental.update({
      where: { id: rental.id },
      data: {
        status: "RETURNED",
        endDate: new Date(),
      },
    });

    // Se o usuário completou mais aluguéis e tem os requisitos, promove ele de Categoria (Starter -> Bronze, etc)
    await incrementRentalCountAndMaybePromote(rental.userId);

    // 👇 APLICA A LOGICA DE PONTUAÇÃO E PENALIDADE DE ATRASO
    try {
      await applyRentalReturnPoints(rental.userId, rental.game?.tier || null, isLate);
    } catch (pointsErr) {
      console.error("Erro ao processar pontos de devolução:", pointsErr);
    }

    return res.json(updated);
  } catch (err) {
    console.error("Erro ao finalizar aluguel:", err);
    return res.status(500).json({ error: "Erro ao finalizar aluguel" });
  }
});

// =======================================================
// GET: Calendário (Dias Indisponíveis)
// =======================================================
rentalRoutes.get("/game/:gameId/unavailable-dates", ensureAuthenticated, async (req, res) => {
  const { gameId } = req.params;
  const { year, month } = req.query; 

  if (!year || !month) {
    return res.status(400).json({ error: "Ano e mês são obrigatórios." });
  }

  const targetYear = parseInt(String(year));
  const targetMonth = parseInt(String(month));

  try {
    const game = await prisma.game.findUnique({
      where: { id: String(gameId) },
      select: { allowOriginalRental: true, available: true },
    });

    if (!game) {
      return res.json({ unavailableDates: ["ALL"] });
    }

    const copiesCount = await prisma.gameCopy.count({
      where: {
        gameId: String(gameId),
        available: true,
      },
    });

    const totalCopies = copiesCount + (game.allowOriginalRental && game.available ? 1 : 0);

    if (totalCopies === 0) {
      return res.json({ unavailableDates: ["ALL"] });
    }
    
    const startOfMonth = new Date(targetYear, targetMonth, 1);
    const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
   
    const rentalsInMonth = await prisma.rental.findMany({
      where: {
        gameId: String(gameId),
        status: { in: ["PENDING", "ACTIVE"] },
        startDate: { lte: endOfMonth },
        endDate: { gte: startOfMonth },
      },
      select: {
        startDate: true,
        endDate: true,
      },
    });

    const holidays = await getHolidaysByYear(targetYear);
    const unavailableDates: string[] = [];
    const daysInMonth = endOfMonth.getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(targetYear, targetMonth, day);
      const formattedDate = toISODateString(currentDate);
      
      if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
        continue;
      }

      if (holidays.includes(formattedDate)) {
        unavailableDates.push(formattedDate);
        continue;
      }
      
      const startOfDay = new Date(targetYear, targetMonth, day, 0, 0, 0);
      const endOfDay = new Date(targetYear, targetMonth, day, 23, 59, 59);

      let conflictingRentalsThisDay = 0;

      for (const rental of rentalsInMonth) {
        if (rental.startDate <= endOfDay && rental.endDate >= startOfDay) {
          conflictingRentalsThisDay++;
        }
      }
      
      if (conflictingRentalsThisDay >= totalCopies) {
        unavailableDates.push(formattedDate);
      }
    }

    return res.json({ unavailableDates });
  } catch (err) {
    console.error("Erro ao buscar datas indisponíveis:", err);
    return res.status(500).json({ error: "Erro interno ao calcular disponibilidade." });
  }
});