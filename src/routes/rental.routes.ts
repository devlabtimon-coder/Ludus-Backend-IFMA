import { Router } from "express";
import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";
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

function getSpTime(date: Date) {
  return new Date(date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

function toSpDateString(date: Date) {
  const sp = getSpTime(date);
  return `${sp.getFullYear()}-${String(sp.getMonth() + 1).padStart(2, "0")}-${String(sp.getDate()).padStart(2, "0")}`;
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

  const spStart = getSpTime(startDate);
  const spEnd = getSpTime(endDate);

  const startDay = spStart.getDay();
  const endDay = spEnd.getDay();

  if (startDay === 0 || startDay === 6 || endDay === 0 || endDay === 6) {
    return res.status(400).json({ error: "A biblioteca funciona apenas de segunda a sexta-feira." });
  }

  const startHour = spStart.getHours();
  const endHour = spEnd.getHours();

  if (startHour < 8 || startHour >= 19 || endHour < 8 || endHour > 19) {
    return res.status(400).json({ error: "Horário de agendamento fora do funcionamento (08h às 19h)." });
  }

  const holidays = await getHolidaysByYear(spStart.getFullYear());
  const startStr = toSpDateString(startDate);
  const endStr = toSpDateString(endDate);

  if (holidays.includes(startStr)) {
    return res.status(400).json({ error: "A data de retirada cai em um feriado. A biblioteca estará fechada." });
  }

  if (holidays.includes(endStr)) {
    return res.status(400).json({ error: "A data de devolução cai em um feriado. A biblioteca estará fechada." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`;

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
          body: { error: "Você possui 2 aluguéis em aberto.", code: "RENTAL_LIMIT_REACHED" },
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
        const targetCopyId = String(copyId);
        
        const isValidCopy = availableCopies.some(c => c.id === targetCopyId);
        if (!isValidCopy) {
          return { 
            status: 400, 
            body: { error: "Exemplar inválido, indisponível ou pertencente a outro jogo.", code: "INVALID_COPY" } 
          } as const;
        }

        if (takenCopyIds.includes(targetCopyId)) {
          return { status: 409, body: { error: "Este exemplar já está reservado no horário selecionado.", code: "TIME_SLOT_TAKEN" } } as const;
        }
        assignedCopyId = targetCopyId;
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
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    if (result.status === 201 && "id" in result.body) {
      try {
        const game = await prisma.game.findUnique({
          where: { id: String(gameId) },
          select: { title: true },
        });

        await notifyUser({
          userId,
          type: "RENTAL_CREATED",
          title: "Reserva Confirmada",
          body: `Sua reserva de "${game?.title}" foi agendada!`,
          channelId: "rentals",
        });

        await notifyAdmins({
          title: "Nova Solicitação de Aluguel",
          body: `O usuário ${result.userName} solicitou a retirada de "${game?.title}".`,
          data: { route: "/emprestimos" },
          dedupeKey: `ADMIN_NEW_RENTAL_${result.body.id}`
        });
      } catch (notifyErr) {
        console.error("Erro não-crítico ao disparar notificações de aluguel:", notifyErr);
      }
    }

    return res.status(result.status).json(result.body);

  } catch (err: any) {
    if (err?.code === "P2034") {
      return res.status(409).json({ 
        error: "Este exemplar acabou de ser reservado por outra pessoa neste mesmo milissegundo. Atualize a página e tente outro horário.", 
        code: "CONCURRENCY_CONFLICT" 
      });
    }
    console.error("Erro na criação do aluguel:", err);
    return res.status(500).json({ error: "Erro interno ao processar a reserva." });
  }
});

rentalRoutes.get("/me", ensureAuthenticated, async (req, res) => {
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
});

rentalRoutes.patch("/:id/cancel", ensureAuthenticated, ensureUserOnly, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Rental" WHERE id = ${id} FOR UPDATE`;

      const rental = await tx.rental.findUnique({
        where: { id: String(id) },
        include: {
          game: { select: { id: true, title: true } },
          copy: { select: { id: true } },
        },
      });

      if (!rental || rental.userId !== userId) {
        return { status: 404, body: { error: "Aluguel não encontrado." } } as const;
      }

      if (rental.status !== "PENDING") {
        return {
          status: 409,
          body: {
            error: "Só é possível cancelar um aluguel que ainda está pendente.",
            code: "ONLY_PENDING_CAN_CANCEL",
          },
        } as const;
      }

      const cancelledRental = await tx.rental.update({
        where: { id: rental.id },
        data: { status: "CANCELED" },
        include: {
          game: { select: { id: true, title: true, cover: true } },
          copy: { select: { id: true, code: true, number: true } },
        },
      });

      return { status: 200, body: cancelledRental } as const;
    });

    if (updated.status !== 200) {
      return res.status(updated.status).json(updated.body);
    }

    const rentalData = updated.body;

    applyCancellationPenalty(userId).catch(() => {});

    notifyUser({
      userId,
      type: "SYSTEM_ANNOUNCEMENT",
      title: "Aluguel cancelado",
      body: `Seu aluguel de "${rentalData.game?.title || rentalData.gameTitleSnapshot}" foi cancelado com sucesso.`,
      channelId: "rentals",
      data: { route: "/rentals", rentalId: rentalData.id },
    }).catch(() => {});

    if (rentalData.gameId) {
      notifyGameBackAvailable(rentalData.gameId).catch(() => {});
    }

    const finalMapped = {
      ...rentalData,
      game: rentalData.game
        ? rentalData.game
        : { id: null, title: rentalData.gameTitleSnapshot, cover: rentalData.gameCoverSnapshot },
      copy: rentalData.copy
        ? rentalData.copy
        : rentalData.copyCodeSnapshot || rentalData.copyNumberSnapshot
        ? { id: null, code: rentalData.copyCodeSnapshot, number: rentalData.copyNumberSnapshot }
        : null,
    };

    return res.json(finalMapped);
  } catch (err) {
    console.error("Erro ao cancelar aluguel:", err);
    return res.status(500).json({ error: "Erro interno ao processar cancelamento." });
  }
});

rentalRoutes.get("/game/:gameId/unavailable-dates", ensureAuthenticated, async (req, res) => {
  const { gameId } = req.params;
  const { year, month } = req.query; 

  if (!year || !month) {
    return res.status(400).json({ error: "Ano e mês são obrigatórios." });
  }

  const game = await prisma.game.findUnique({
    where: { id: String(gameId) },
    select: { allowOriginalRental: true, available: true },
  });

  if (!game) return res.status(404).json({ error: "Jogo não encontrado." });

  const copiesCount = await prisma.gameCopy.count({
    where: { gameId: String(gameId), available: true },
  });

  const totalCopies = copiesCount + (game.allowOriginalRental && game.available ? 1 : 0);

  if (totalCopies === 0) {
    return res.json({ unavailableDates: ["ALL"] });
  }

  const y = parseInt(String(year), 10);
  const m = parseInt(String(month), 10);

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const startOfMonth = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const endOfMonth = new Date(Date.UTC(y, m - 1, daysInMonth, 23, 59, 59));

  const rentalsThisMonth = await prisma.rental.findMany({
    where: {
      gameId: String(gameId),
      status: { in: ["PENDING", "ACTIVE"] },
      startDate: { lte: endOfMonth },
      endDate: { gte: startOfMonth },
    },
    select: { startDate: true, endDate: true },
  });

  const holidays = await getHolidaysByYear(y);
  const unavailableDates: string[] = [];

  const BUFFER_MS = 30 * 60 * 1000;
  const now = new Date();

  for (let day = 1; day <= daysInMonth; day++) {
    const targetDate = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
    const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const dayOfWeek = targetDate.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = holidays.includes(dateStr);

    if (isWeekend || isHoliday) continue;

    let slotsLivres = 0;

    for (let hour = 8; hour < 19; hour++) {
      for (const minute of [0, 30]) {
        if (hour === 18 && minute === 30) continue;

        const slotStart = new Date(Date.UTC(y, m - 1, day, hour + 3, minute, 0));
        const slotEnd = new Date(slotStart.getTime() + (30 * 60 * 1000));

        if (slotStart < now) continue;

        let conflictingCopies = 0;
        for (const r of rentalsThisMonth) {
          const rentalStart = r.startDate.getTime();
          const rentalEndWithBuffer = r.endDate.getTime() + BUFFER_MS;
          if (slotStart.getTime() < rentalEndWithBuffer && slotEnd.getTime() > rentalStart) {
            conflictingCopies++;
          }
        }

        if (conflictingCopies < totalCopies) {
          slotsLivres++;
        }
      }
    }

    if (slotsLivres === 0) {
      unavailableDates.push(dateStr);
    }
  }

  return res.json({ unavailableDates });
});

rentalRoutes.get("/game/:gameId/availability", ensureAuthenticated, async (req, res) => {
  const { gameId } = req.params;
  const { date } = req.query; 

  if (!date || typeof date !== "string") {
    return res.status(400).json({ error: "A data (YYYY-MM-DD) é obrigatória." });
  }

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

  const [y, m, d] = date.split("-").map(Number);
  const targetDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayOfWeek = targetDate.getUTCDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const holidays = await getHolidaysByYear(y);
  const isHoliday = holidays.includes(date);

  if (isWeekend || isHoliday || totalCopies === 0) {
    return res.json({ availableSlots: [] }); 
  }

  const startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));

  const rentalsToday = await prisma.rental.findMany({
    where: {
      gameId: String(gameId),
      status: { in: ["PENDING", "ACTIVE"] },
      startDate: { lte: endOfDay },
      endDate: { gte: startOfDay },
    },
    select: { startDate: true, endDate: true },
  });

  const slots: string[] = [];
  const BUFFER_MS = 30 * 60 * 1000;
  const now = new Date();

  for (let hour = 8; hour < 19; hour++) {
    for (const minute of [0, 30]) {
      if (hour === 18 && minute === 30) continue;
      
      const slotStart = new Date(Date.UTC(y, m - 1, d, hour + 3, minute, 0));
      const slotEnd = new Date(slotStart.getTime() + (30 * 60 * 1000));
      
      if (slotStart < now) continue;

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
});