import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError } from "../errors/HttpError";
import { notifyUser } from "./notify.service";
import { notifyAdmins } from "./adminNotification.service";
import { notifyGameBackAvailable } from "./gameAvailability.service";
import { getHolidaysByYear } from "./holiday.service";
import { canClientRentTier } from "./category.service";
import { applyCancellationPenalty, applyNoShowPenalty } from "./engagement.service";

// Folga entre a devolução de um aluguel e a próxima retirada do mesmo exemplar.
export const RENTAL_BUFFER_MS = 30 * 60 * 1000;
export const MAX_OPEN_RENTALS = 2;
// Tolerância após o horário de retirada antes de cancelar por não comparecimento.
export const NO_SHOW_GRACE_MS = 30 * 60 * 1000;

const OPEN_STATUSES = ["PENDING", "ACTIVE"] as const;

export type CreateRentalInput = {
  gameId: string;
  copyId?: string | null;
  startDateIso: string;
  endDateIso: string;
};

function getSpTime(date: Date) {
  return new Date(date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

function toSpDateString(date: Date) {
  const sp = getSpTime(date);
  return `${sp.getFullYear()}-${String(sp.getMonth() + 1).padStart(2, "0")}-${String(sp.getDate()).padStart(2, "0")}`;
}

// Jogo e exemplar podem ter sido apagados; nesse caso usa os dados guardados no aluguel.
type RentalWithRelations = {
  game: Record<string, any> | null;
  copy: Record<string, any> | null;
  gameTitleSnapshot: string;
  gameCoverSnapshot: string | null;
  copyCodeSnapshot: string | null;
  copyNumberSnapshot: number | null;
};

function withSnapshotFallback<T extends RentalWithRelations>(
  rental: T,
  missingGame: Record<string, any>,
) {
  return {
    ...rental,
    game: rental.game ? rental.game : { id: null, title: rental.gameTitleSnapshot, cover: rental.gameCoverSnapshot, ...missingGame },
    copy: rental.copy
      ? rental.copy
      : rental.copyCodeSnapshot || rental.copyNumberSnapshot
      ? { id: null, code: rental.copyCodeSnapshot, number: rental.copyNumberSnapshot }
      : null,
  };
}

async function assertRentalWindow(startDate: Date, endDate: Date) {
  const now = new Date();

  if (startDate >= endDate) {
    throw new HttpError(400, "A devolução deve ocorrer após a retirada.");
  }

  if (startDate < now) {
    throw new HttpError(400, "Não é possível agendar reservas no passado.");
  }

  const spStart = getSpTime(startDate);
  const spEnd = getSpTime(endDate);

  const startDay = spStart.getDay();
  const endDay = spEnd.getDay();

  if (startDay === 0 || startDay === 6 || endDay === 0 || endDay === 6) {
    throw new HttpError(400, "A biblioteca funciona apenas de segunda a sexta-feira.");
  }

  const startHour = spStart.getHours();
  const endHour = spEnd.getHours();

  if (startHour < 8 || startHour >= 19 || endHour < 8 || endHour > 19) {
    throw new HttpError(400, "Horário de agendamento fora do funcionamento (08h às 19h).");
  }

  const holidays = await getHolidaysByYear(spStart.getFullYear());

  if (holidays.includes(toSpDateString(startDate))) {
    throw new HttpError(400, "A data de retirada cai em um feriado. A biblioteca estará fechada.");
  }

  if (holidays.includes(toSpDateString(endDate))) {
    throw new HttpError(400, "A data de devolução cai em um feriado. A biblioteca estará fechada.");
  }
}

export async function createRental(userId: string, input: CreateRentalInput) {
  const { gameId, copyId } = input;
  const startDate = new Date(input.startDateIso);
  const endDate = new Date(input.endDateIso);

  await assertRentalWindow(startDate, endDate);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`;

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          clientCategory: true,
          registrationStatus: true,
          isAcademicVerified: true,
        },
      });

      if (!user) {
        throw new HttpError(404, "Usuário não encontrado");
      }

      const isIfmaMode = process.env.IFMA_MODE === "true" || process.env.EXPO_PUBLIC_IFMA_MODE === "true";

      if (isIfmaMode) {
        if (!user.isAcademicVerified) {
          throw new HttpError(403, "Vínculo acadêmico não verificado.", "ACCOUNT_PENDING");
        }
      } else if (user.registrationStatus !== "APPROVED") {
        throw new HttpError(403, "Sua conta ainda não foi aprovada para aluguéis.", "ACCOUNT_PENDING");
      }

      if (user.clientCategory === "STARTER") {
        const isSameDay =
          startDate.getFullYear() === endDate.getFullYear() &&
          startDate.getMonth() === endDate.getMonth() &&
          startDate.getDate() === endDate.getDate();

        if (!isSameDay) {
          throw new HttpError(400, "Usuários STARTER devem agendar a devolução para o mesmo dia da retirada.");
        }
      }

      const activeCount = await tx.rental.count({
        where: { userId, status: { in: [...OPEN_STATUSES] } },
      });

      if (activeCount >= MAX_OPEN_RENTALS) {
        throw new HttpError(409, "Você possui 2 aluguéis em aberto.", "RENTAL_LIMIT_REACHED");
      }

      const game = await tx.game.findUnique({
        where: { id: String(gameId) },
        select: {
          id: true, title: true, cover: true, available: true,
          allowOriginalRental: true, isActive: true, isVisible: true, tier: true,
        },
      });

      if (!game || !game.isActive || !game.isVisible) {
        throw new HttpError(404, "Jogo não encontrado");
      }

      if (game.tier && !canClientRentTier(user.clientCategory, game.tier)) {
        throw new HttpError(403, "Sua categoria não permite alugar este jogo.", "TIER_ACCESS_DENIED");
      }

      const availableCopies = await tx.gameCopy.findMany({
        where: { gameId: game.id, available: true },
      });

      const openRentals = await tx.rental.findMany({
        where: { gameId: game.id, status: { in: [...OPEN_STATUSES] } },
        select: { copyId: true, startDate: true, endDate: true },
      });

      const requestedStartMs = startDate.getTime();
      const requestedEndMs = endDate.getTime();

      const takenCopyIds = openRentals
        .filter((rental) => {
          const rentalEndWithBufferMs = rental.endDate.getTime() + RENTAL_BUFFER_MS;
          return requestedStartMs < rentalEndWithBufferMs && requestedEndMs > rental.startDate.getTime();
        })
        .map((rental) => rental.copyId);
      const isOriginalTaken = takenCopyIds.includes(null);

      let assignedCopyId: string | null | undefined = undefined;

      if (copyId) {
        const targetCopyId = String(copyId);

        if (!availableCopies.some((c) => c.id === targetCopyId)) {
          throw new HttpError(400, "Exemplar inválido, indisponível ou pertencente a outro jogo.", "INVALID_COPY");
        }

        if (takenCopyIds.includes(targetCopyId)) {
          throw new HttpError(409, "Este exemplar já está reservado no horário selecionado.", "TIME_SLOT_TAKEN");
        }
        assignedCopyId = targetCopyId;
      } else if (game.allowOriginalRental && game.available && !isOriginalTaken) {
        assignedCopyId = null;
      } else {
        const freeCopy = availableCopies.find((c) => !takenCopyIds.includes(c.id));
        if (freeCopy) assignedCopyId = freeCopy.id;
      }

      if (assignedCopyId === undefined) {
        throw new HttpError(409, "Todos os exemplares deste jogo já estão reservados neste horário.", "TIME_SLOT_TAKEN");
      }

      const selectedCopy = assignedCopyId !== null ? availableCopies.find((c) => c.id === assignedCopyId) : undefined;

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
          copyCodeSnapshot: selectedCopy?.code ?? null,
          copyNumberSnapshot: selectedCopy?.number ?? null,
        },
      });

      return { rental, userName: user.name, gameTitle: game.title };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (err: any) {
    if (err?.code === "P2034") {
      throw new HttpError(
        409,
        "Este exemplar acabou de ser reservado por outra pessoa neste mesmo milissegundo. Atualize a página e tente outro horário.",
        "CONCURRENCY_CONFLICT",
      );
    }
    throw err;
  }

  try {
    await notifyUser({
      userId,
      type: "RENTAL_CREATED",
      title: "Reserva Confirmada",
      body: `Sua reserva de "${created.gameTitle}" foi agendada!`,
      channelId: "rentals",
    });

    await notifyAdmins({
      title: "Nova Solicitação de Aluguel",
      body: `O usuário ${created.userName} solicitou a retirada de "${created.gameTitle}".`,
      data: { route: "/emprestimos" },
      dedupeKey: `ADMIN_NEW_RENTAL_${created.rental.id}`,
    });
  } catch (notifyErr) {
    console.error("Erro não-crítico ao disparar notificações de aluguel:", notifyErr);
  }

  return created.rental;
}

export async function listUserRentals(userId: string) {
  const rentals = await prisma.rental.findMany({
    where: { userId },
    orderBy: { startDate: "desc" },
    include: {
      game: { select: { id: true, title: true, cover: true, isActive: true, isVisible: true } },
      copy: { select: { id: true, code: true, number: true } },
    },
  });

  return rentals.map((r) => withSnapshotFallback(r, { isActive: false, isVisible: false }));
}

export async function cancelRental(userId: string, rentalId: string) {
  const cancelled = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Rental" WHERE id = ${rentalId} FOR UPDATE`;

    const rental = await tx.rental.findUnique({
      where: { id: String(rentalId) },
      select: { id: true, userId: true, status: true },
    });

    if (!rental || rental.userId !== userId) {
      throw new HttpError(404, "Aluguel não encontrado.");
    }

    if (rental.status !== "PENDING") {
      throw new HttpError(409, "Só é possível cancelar um aluguel que ainda está pendente.", "ONLY_PENDING_CAN_CANCEL");
    }

    return tx.rental.update({
      where: { id: rental.id },
      data: { status: "CANCELED" },
      include: {
        game: { select: { id: true, title: true, cover: true } },
        copy: { select: { id: true, code: true, number: true } },
      },
    });
  });

  applyCancellationPenalty(userId).catch(() => {});

  notifyUser({
    userId,
    type: "SYSTEM_ANNOUNCEMENT",
    title: "Aluguel cancelado",
    body: `Seu aluguel de "${cancelled.game?.title || cancelled.gameTitleSnapshot}" foi cancelado com sucesso.`,
    channelId: "rentals",
    data: { route: "/rentals", rentalId: cancelled.id },
  }).catch(() => {});

  if (cancelled.gameId) {
    notifyGameBackAvailable(cancelled.gameId).catch(() => {});
  }

  return withSnapshotFallback(cancelled, {});
}

// ---- Disponibilidade (horários de 30 min, das 08h às 18h30, horário de Brasília) ----

type BookedInterval = { startDate: Date; endDate: Date };

async function countRentableUnits(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { allowOriginalRental: true, available: true },
  });

  if (!game) {
    throw new HttpError(404, "Jogo não encontrado.");
  }

  const copiesCount = await prisma.gameCopy.count({
    where: { gameId, available: true },
  });

  return copiesCount + (game.allowOriginalRental && game.available ? 1 : 0);
}

function findOpenRentalsBetween(gameId: string, from: Date, to: Date) {
  return prisma.rental.findMany({
    where: {
      gameId,
      status: { in: [...OPEN_STATUSES] },
      startDate: { lte: to },
      endDate: { gte: from },
    },
    select: { startDate: true, endDate: true },
  });
}

// Horários livres de um dia (y, m, d em Brasília), já descartando os que passaram.
function freeSlotsOfDay(y: number, m: number, d: number, booked: BookedInterval[], totalUnits: number) {
  const slots: string[] = [];
  const now = new Date();

  for (let hour = 8; hour < 19; hour++) {
    for (const minute of [0, 30]) {
      if (hour === 18 && minute === 30) continue;

      const slotStart = new Date(Date.UTC(y, m - 1, d, hour + 3, minute, 0));
      const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

      if (slotStart < now) continue;

      const conflicting = booked.filter(
        (r) => slotStart.getTime() < r.endDate.getTime() + RENTAL_BUFFER_MS && slotEnd.getTime() > r.startDate.getTime(),
      ).length;

      if (conflicting < totalUnits) {
        slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
      }
    }
  }

  return slots;
}

function isWeekendUtc(y: number, m: number, d: number) {
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

export async function getUnavailableDates(gameId: string, year: number, month: number) {
  const totalUnits = await countRentableUnits(gameId);

  if (totalUnits === 0) {
    return ["ALL"];
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endOfMonth = new Date(Date.UTC(year, month - 1, daysInMonth, 23, 59, 59));

  const booked = await findOpenRentalsBetween(gameId, startOfMonth, endOfMonth);
  const holidays = await getHolidaysByYear(year);
  const unavailableDates: string[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    if (isWeekendUtc(year, month, day) || holidays.includes(dateStr)) continue;

    if (freeSlotsOfDay(year, month, day, booked, totalUnits).length === 0) {
      unavailableDates.push(dateStr);
    }
  }

  return unavailableDates;
}

export async function getAvailableSlots(gameId: string, date: string) {
  const totalUnits = await countRentableUnits(gameId);

  const [y, m, d] = date.split("-").map(Number);
  const holidays = await getHolidaysByYear(y);

  if (isWeekendUtc(y, m, d) || holidays.includes(date) || totalUnits === 0) {
    return [];
  }

  const booked = await findOpenRentalsBetween(
    gameId,
    new Date(Date.UTC(y, m - 1, d, 0, 0, 0)),
    new Date(Date.UTC(y, m - 1, d, 23, 59, 59)),
  );

  return freeSlotsOfDay(y, m, d, booked, totalUnits);
}

// ---- Não comparecimento ----

// Cancela a reserva apenas se ela ainda estiver pendente, numa única operação.
// Se o admin confirmou a retirada nesse meio tempo, nada muda; e com várias
// instâncias rodando o job, só uma consegue cancelar (e penalizar).
export async function cancelIfStillPending(rentalId: string): Promise<boolean> {
  const { count } = await prisma.rental.updateMany({
    where: { id: rentalId, status: "PENDING" },
    data: { status: "CANCELED" },
  });
  return count === 1;
}

export async function cancelNoShows(now = new Date()) {
  const noShows = await prisma.rental.findMany({
    where: {
      status: "PENDING",
      startDate: { lt: new Date(now.getTime() - NO_SHOW_GRACE_MS) },
    },
    select: {
      id: true,
      userId: true,
      gameId: true,
      gameTitleSnapshot: true,
      game: { select: { title: true } },
    },
  });

  let cancelled = 0;

  for (const r of noShows) {
    try {
      if (!(await cancelIfStillPending(r.id))) continue;
      cancelled++;

      try {
        await applyNoShowPenalty(r.userId);
      } catch (err) {
        console.error("Erro ao aplicar penalidade de no-show:", err);
      }

      await notifyUser({
        userId: r.userId,
        type: "SYSTEM_ANNOUNCEMENT",
        title: "Reserva Cancelada por Não Comparecimento ❌",
        body: `Sua reserva de "${r.game?.title || r.gameTitleSnapshot}" foi cancelada automaticamente pois não foi retirada no horário agendado.`,
        channelId: "rentals",
        data: { route: "/rentals", rentalId: r.id },
        dedupeKey: `RENTAL_NOSHOW:${r.id}`,
      });

      if (r.gameId) {
        await notifyGameBackAvailable(r.gameId).catch((err) =>
          console.error("Erro ao avisar disponibilidade pós no-show:", err),
        );
      }
    } catch (err) {
      console.error(`Erro ao processar no-show do aluguel ${r.id}:`, err);
    }
  }

  return cancelled;
}
