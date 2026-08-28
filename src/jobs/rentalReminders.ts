import cron from "node-cron";
import { RentalStatus, NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { notifyUser } from "../services/notify.service";
import { applyNoShowPenalty } from "../services/engagement.service";
import { notifyGameBackAvailable } from "../services/gameAvailability.service";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function startRentalReminderJob() {
  cron.schedule("0 * * * *", async () => {
    const now = new Date();

    const tomorrow = addDays(now, 1);
    const in24hStart = startOfDay(tomorrow);
    const in24hEnd = endOfDay(tomorrow);

    const due24h = await prisma.rental.findMany({
      where: {
        status: RentalStatus.ACTIVE,
        endDate: { gte: in24hStart, lte: in24hEnd },
      },
      select: {
        id: true,
        userId: true,
        endDate: true,
        gameTitleSnapshot: true,
        game: { select: { id: true, title: true } },
      },
    });

    for (const r of due24h) {
      const gameTitle = r.game?.title || r.gameTitleSnapshot;
      const gameId = r.game?.id ?? null;

      await notifyUser({
        userId: r.userId,
        type: NotificationType.RENTAL_DUE_24H,
        title: "Seu aluguel vence em 24h ⏳",
        body: `O jogo "${gameTitle}" vence amanhã. Combine a devolução na biblioteca.`,
        channelId: "rentals",
        data: { route: "/rentals", rentalId: r.id, gameId },
        dedupeKey: `RENTAL_DUE_24H:${r.id}:${startOfDay(now).toISOString()}`,
      });
    }

    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const dueToday = await prisma.rental.findMany({
      where: {
        status: RentalStatus.ACTIVE,
        endDate: { gte: todayStart, lte: todayEnd },
      },
      select: {
        id: true,
        userId: true,
        endDate: true,
        gameTitleSnapshot: true,
        game: { select: { id: true, title: true } },
      },
    });

    for (const r of dueToday) {
      const gameTitle = r.game?.title || r.gameTitleSnapshot;
      const gameId = r.game?.id ?? null;

      await notifyUser({
        userId: r.userId,
        type: NotificationType.RENTAL_DUE_TODAY,
        title: "Seu aluguel vence hoje 🚨",
        body: `O jogo "${gameTitle}" vence hoje. Devolva na Biblioteca IFMA - Campus Timon.`,
        channelId: "rentals",
        data: { route: "/rentals", rentalId: r.id, gameId },
        dedupeKey: `RENTAL_DUE_TODAY:${r.id}:${todayStart.toISOString()}`,
      });
    }

    const overdue = await prisma.rental.findMany({
      where: {
        status: RentalStatus.ACTIVE,
        endDate: { lt: now },
      },
      select: {
        id: true,
        userId: true,
        endDate: true,
        gameTitleSnapshot: true,
        game: { select: { id: true, title: true } },
      },
    });

    for (const r of overdue) {
      const gameTitle = r.game?.title || r.gameTitleSnapshot;
      const gameId = r.game?.id ?? null;

      await notifyUser({
        userId: r.userId,
        type: NotificationType.RENTAL_OVERDUE,
        title: "Devolução em atraso ❌",
        body: `O jogo "${gameTitle}" está em atraso. Regularize na biblioteca.`,
        channelId: "rentals",
        data: { route: "/rentals", rentalId: r.id, gameId },
        dedupeKey: `RENTAL_OVERDUE:${r.id}:${todayStart.toISOString()}`,
      });
    }

    const noShows = await prisma.rental.findMany({
      where: {
        status: RentalStatus.PENDING,
        endDate: { lt: now },
      },
      select: {
        id: true,
        userId: true,
        gameId: true,
        copyId: true,
        gameTitleSnapshot: true,
        game: { select: { title: true } },
      },
    });

    for (const r of noShows) {
      await prisma.$transaction(async (tx) => {
        await tx.rental.update({
          where: { id: r.id },
          data: { status: RentalStatus.CANCELED },
        });

        if (r.copyId) {
          await tx.gameCopy.update({
            where: { id: r.copyId },
            data: { available: true },
          });
        } else if (r.gameId) {
          await tx.game.update({
            where: { id: r.gameId },
            data: { available: true },
          });
        }
      });

      try {
        await applyNoShowPenalty(r.userId);
      } catch (err) {
        console.error("Erro ao aplicar penalidade de no-show:", err);
      }

      const gameTitle = r.game?.title || r.gameTitleSnapshot;
      await notifyUser({
        userId: r.userId,
        type: "SYSTEM_ANNOUNCEMENT" as NotificationType,
        title: "Reserva Cancelada 🚫",
        body: `Sua reserva de "${gameTitle}" foi cancelada por não comparecimento no prazo.`,
        channelId: "rentals",
        data: { route: "/rentals", rentalId: r.id },
        dedupeKey: `RENTAL_NOSHOW:${r.id}`,
      });

      if (r.gameId) {
        try {
          await notifyGameBackAvailable(r.gameId);
        } catch (err) {
          console.error("Erro ao avisar disponibilidade pós no-show:", err);
        }
      }
    }
  });
}