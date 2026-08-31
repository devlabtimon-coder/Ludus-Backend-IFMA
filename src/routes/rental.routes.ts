import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureUserOnly } from "../middlewares/ensureUserOnly";
import { notifyUser } from "../services/notify.service";
import { notifyAdmins } from "../services/adminNotification.service";
import { notifyGameBackAvailable } from "../services/gameAvailability.service";
import { getHolidaysByYear } from "../services/holiday.service";
import {
  canClientRentTier,
  incrementRentalCountAndMaybePromote,
} from "../services/category.service";
import {
  applyCancellationPenalty,
  applyRentalReturnPoints,
} from "../services/engagement.service";

export const rentalRoutes = Router();

function getBrtDate(date: Date) {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000);
}

function toBrtDateString(brtDate: Date) {
  return `${brtDate.getUTCFullYear()}-${String(brtDate.getUTCMonth() + 1).padStart(2, "0")}-${String(brtDate.getUTCDate()).padStart(2, "0")}`;
}

rentalRoutes.post("/", ensureAuthenticated, ensureUserOnly, async (req, res) => {
  const userId = req.user.id;
  const { gameId, copyId, startDateIso, endDateIso } = req.body;

  if (!gameId || !startDateIso || !endDateIso) {
    return res.status(400).json({ error: "gameId, startDateIso e endDateIso são obrigatórios" });
  }

  const startDate = new Date(startDateIso);
  const endDate = new Date(endDateIso);
  const now = new Date();

  if (startDate >= endDate) {
    return res.status(400).json({ error: "A devolução deve ocorrer após a retirada." });
  }

  if (startDate < now) {
    return res.status(400).json({ error: "Não é possível agendar reservas no passado." });
  }

  const brtStart = getBrtDate(startDate);
  const brtEnd = getBrtDate(endDate);

  const startDay = brtStart.getUTCDay();
  const endDay = brtEnd.getUTCDay();

  if (startDay === 0 || startDay === 6 || endDay === 0 || endDay === 6) {
    return res.status(400).json({ error: "A biblioteca funciona apenas de segunda a sexta-feira." });
  }

  const startHour = brtStart.getUTCHours();
  const endHour = brtEnd.getUTCHours();

  if (startHour < 8 || startHour >= 19 || endHour < 8 || endHour > 19) {
    return res.status(400).json({ error: "Horário de agendamento fora do funcionamento (08h às 19h)." });
  }

  const holidays = await getHolidaysByYear(brtStart.getUTCFullYear());
  const startStr = toBrtDateString(brtStart);
  const endStr = toBrtDateString(brtEnd);

  if (holidays.includes(startStr)) {
    return res.status(400).json({ error: "A data de retirada cai em um feriado. A biblioteca estará fechada." });
  }
  if (holidays.includes(endStr)) {
    return res.status(400).json({ error: "A data de devolução cai em um feriado. A biblioteca estará fechada." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { 
          id: true, 
          name: true,
          clientCategory: true,
          registrationStatus: true,
          isAcademicVerified: true 
        },
      });

      if (!user) {
        return { status: 404, body: { error: "Usuário não encontrado" } } as const;
      }

      const isIfmaMode = process.env.IFMA_MODE === "true" || process.env.EXPO_PUBLIC_IFMA_MODE === "true";
      
      if (isIfmaMode) {
        if (!user.isAcademicVerified) {
          return {
            status: 403,
            body: { error: "Vínculo acadêmico não verificado.", code: "ACCOUNT_PENDING" },
          } as const;
        }
      } else {
        if (user.registrationStatus !== "APPROVED") {
          return {
            status: 403,
            body: { error: "Sua conta ainda não foi aprovada para aluguéis.", code: "ACCOUNT_PENDING" },
          } as const;
        }
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

      const availableCopies = await tx.gameCopy.findMany({
        where: { gameId: game.id, available: true }
      });

      const allActiveRentals = await tx.rental.findMany({
        where: {
          gameId: game.id,
          status: { in: ["PENDING", "ACTIVE"] },
        },
        select: { copyId: true, startDate: true, endDate: true }
      });

      const BUFFER_MS = 30 * 60 * 1000; 
      const requestedStartMs = startDate.getTime();
      const requestedEndMs = endDate.getTime();

      const overlappingRentals = allActiveRentals.filter((rental) => {
        const rentalStartMs = rental.startDate.getTime();
        const rentalEndWithBufferMs = rental.endDate.getTime() + BUFFER_MS;

        return requestedStartMs < rentalEndWithBufferMs && requestedEndMs > rentalStartMs;
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

      return { status: 201, body: rental, userName: user.name } as const;
    });

    if (result.status === 201 && "id" in result.body) {
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

      await notifyAdmins({
        title: "Nova Solicitação de Aluguel 🔔",
        body: `O usuário ${result.userName} solicitou a retirada de "${game?.title}".`,
        data: { route: "/emprestimos" },
        dedupeKey: `ADMIN_NEW_RENTAL_${result.body.id}`
      });
    }

    return res.status(result.status).json(result.body);

  } catch (err) {
    console.error("Erro ao agendar aluguel:", err);
    return res.status(500).json({ error: "Erro interno ao processar agendamento." });
  }
});

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

rentalRoutes.get("/game/:gameId/availability", ensureAuthenticated, async (req, res) => {
  const { gameId } = req.params;
  const { date } = req.query; 

  if (!date) {
    return res.status(400).json({ error: "A data (YYYY-MM-DD) é obrigatória." });
  }

  try {
    const game = await prisma.game.findUnique({
      where: { id: String(gameId) },
      select: { allowOriginalRental: true, available: true },
    });

    if (!game) {
      return res.status(404).json({ error: "Jogo não encontrado." });
    }

    const copiesCount = await prisma.gameCopy.count({
      where: { gameId: String(gameId), available: true },
    });
    const totalCopies = copiesCount + (game.allowOriginalRental && game.available ? 1 : 0);

    const targetDate = new Date(`${date}T00:00:00-03:00`);
    
    const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6;
    const holidays = await getHolidaysByYear(targetDate.getFullYear());
    const isHoliday = holidays.includes(String(date));

    if (isWeekend || isHoliday || totalCopies === 0) {
      return res.json({ availableSlots: [] }); 
    }

    const startOfDay = new Date(`${date}T00:00:00-03:00`);
    const endOfDay = new Date(`${date}T23:59:59-03:00`);
    
    const rentalsToday = await prisma.rental.findMany({
      where: {
        gameId: String(gameId),
        status: { in: ["PENDING", "ACTIVE"] },
        startDate: { lte: endOfDay },
        endDate: { gte: startOfDay },
      },
      select: { startDate: true, endDate: true },
    });

    const slots = [];
    const BUFFER_MS = 30 * 60 * 1000;
    
    for (let hour = 8; hour < 19; hour++) {
      for (let minute of [0, 30]) {
        if (hour === 18 && minute === 30) continue; 
        
        const slotStart = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`);
        const slotEnd = new Date(slotStart.getTime() + (30 * 60 * 1000));
        
        if (slotStart < new Date()) continue;

        let conflictingCopies = 0;

        for (const r of rentalsToday) {
          const rentalStart = r.startDate.getTime();
          const rentalEndWithBuffer = r.endDate.getTime() + BUFFER_MS;

          if (slotStart.getTime() < rentalEndWithBuffer && slotEnd.getTime() > rentalStart) {
            conflictingCopies++;
          }
        }

        if (conflictingCopies < totalCopies) {
          slots.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
        }
      }
    }

    return res.json({ availableSlots: slots });
  } catch (err) {
    console.error("Erro ao buscar disponibilidade:", err);
    return res.status(500).json({ error: "Erro interno ao calcular horários." });
  }
});