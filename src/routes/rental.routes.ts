import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureUserOnly } from "../middlewares/ensureUserOnly";
import { notifyUser } from "../services/notify.service";
import { notifyGameBackAvailable } from "../services/gameAvailability.service";
import {
  canClientRentTier,
  incrementRentalCountAndMaybePromote,
} from "../services/category.service";

export const rentalRoutes = Router();

const RENTAL_DAYS = 3;

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
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

  try {
    const result = await prisma.$transaction(async (tx) => {
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

      if (copyId) {
        const copy = await tx.gameCopy.findUnique({ where: { id: String(copyId) } });

        if (!copy || copy.gameId !== game.id) {
          return { status: 404, body: { error: "Exemplar não encontrado" } } as const;
        }

        if (!copy.available) {
          return { status: 409, body: { error: "Exemplar em manutenção ou perdido.", code: "COPY_UNAVAILABLE" } } as const;
        }

        const copyCollisions = await tx.rental.count({
          where: {
            copyId: copy.id,
            status: { in: ["PENDING", "ACTIVE"] },
            startDate: { lt: endDate },
            endDate: { gt: startDate }
          }
        });

        if (copyCollisions > 0) {
          return { status: 409, body: { error: "Este exemplar já está reservado no horário selecionado.", code: "TIME_SLOT_TAKEN" } } as const;
        }

        const rental = await tx.rental.create({
          data: {
            userId,
            gameId: game.id,
            copyId: copy.id,
            startDate,
            endDate,
            status: "PENDING",
            gameTitleSnapshot: game.title,
            gameCoverSnapshot: game.cover ?? null,
          },
        });

        return { status: 201, body: rental } as const;
      }

      if (!game.allowOriginalRental) {
        return { status: 409, body: { error: "Este jogo só pode ser alugado por exemplar.", code: "ONLY_COPIES_ALLOWED" } } as const;
      }

      if (!game.available) {
        return { status: 409, body: { error: "Jogo original em manutenção ou perdido.", code: "GAME_UNAVAILABLE" } } as const;
      }

      const originalCollisions = await tx.rental.count({
        where: {
          gameId: game.id,
          copyId: null, 
          status: { in: ["PENDING", "ACTIVE"] },
          startDate: { lt: endDate },
          endDate: { gt: startDate }
        }
      });

      if (originalCollisions > 0) {
        return { status: 409, body: { error: "O jogo original já está reservado no horário selecionado.", code: "TIME_SLOT_TAKEN" } } as const;
      }

      const rental = await tx.rental.create({
        data: {
          userId,
          gameId: game.id,
          copyId: undefined, 
          startDate,
          endDate,
          status: "PENDING",
          gameTitleSnapshot: game.title,
          gameCoverSnapshot: game.cover ?? null,
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

rentalRoutes.get("/me", ensureAuthenticated, async (req, res) => {
  try {
    const rentals = await prisma.rental.findMany({
      where: { userId: req.user.id },
      orderBy: { startDate: "desc" },
      include: {
        game: {
          select: {
            id: true,
            title: true,
            cover: true,
            isActive: true,
            isVisible: true,
          },
        },
        copy: {
          select: {
            id: true,
            code: true,
            number: true,
          },
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
        ? {
            id: null,
            code: r.copyCodeSnapshot,
            number: r.copyNumberSnapshot,
          }
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
        game: {
          select: {
            id: true,
            title: true,
          },
        },
        copy: {
          select: {
            id: true,
          },
        },
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
          game: {
            select: {
              id: true,
              title: true,
              cover: true,
            },
          },
          copy: {
            select: {
              id: true,
              code: true,
              number: true,
            },
          },
        },
      });
    });

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
        : {
            id: null,
            title: updated.gameTitleSnapshot,
            cover: updated.gameCoverSnapshot,
          },
      copy: updated.copy
        ? updated.copy
        : updated.copyCodeSnapshot || updated.copyNumberSnapshot
        ? {
            id: null,
            code: updated.copyCodeSnapshot,
            number: updated.copyNumberSnapshot,
          }
        : null,
    };

    return res.json(finalMapped);
  } catch (err) {
    console.error("Erro ao cancelar aluguel:", err);
    return res.status(500).json({ error: "Erro ao cancelar aluguel." });
  }
});

rentalRoutes.patch("/:id/finish", ensureAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    const rental = await prisma.rental.findUnique({
      where: { id: String(id) },
    });

    if (!rental) {
      return res.status(404).json({ error: "Aluguel não encontrado" });
    }

    if (rental.status !== "ACTIVE") {
      return res.status(409).json({
        error: "Só pode finalizar aluguel ativo",
      });
    }

    const updated = await prisma.rental.update({
      where: { id: rental.id },
      data: {
        status: "RETURNED",
        endDate: new Date(),
      },
    });

    await incrementRentalCountAndMaybePromote(rental.userId);

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao finalizar aluguel" });
  }
});

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

    const unavailableDates: string[] = [];
 
    const daysInMonth = endOfMonth.getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(targetYear, targetMonth, day);
      
      if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
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
        const formattedDate = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        unavailableDates.push(formattedDate);
      }
    }

    return res.json({ unavailableDates });
  } catch (err) {
    console.error("Erro ao buscar datas indisponíveis:", err);
    return res.status(500).json({ error: "Erro interno ao calcular disponibilidade." });
  }
});