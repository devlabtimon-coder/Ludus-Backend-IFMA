import { NotificationType, Prisma, RentalStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError } from "../errors/HttpError";
import { addUserPoints, applyConservationPenalty } from "./engagement.service";
import { incrementRentalCountAndMaybePromote } from "./category.service";
import { notifyUser } from "./notify.service";
import { notifyGameBackAvailable } from "./gameAvailability.service";
import { logAdminAction } from "./adminLog.service";

const ACTIVATION_TOLERANCE_MS = 15 * 60 * 1000;
const FINALIZED_STATUSES: RentalStatus[] = [RentalStatus.RETURNED, RentalStatus.CANCELED];
const ADMIN_SETTABLE_STATUSES: RentalStatus[] = [RentalStatus.ACTIVE, RentalStatus.RETURNED, RentalStatus.CANCELED];

export type AdminRentalFilters = {
  status?: string;
  q?: string;
  overdue?: boolean;
  page: number;
  limit: number;
};

export type UpdateRentalStatusInput = {
  status: RentalStatus;
  applyPenalty?: boolean;
  penaltyReason?: string;
};

export async function listRentals(filters: AdminRentalFilters) {
  const where: Prisma.RentalWhereInput = {};

  if (filters.status && filters.status !== "ALL") {
    if (!Object.values(RentalStatus).includes(filters.status as RentalStatus)) {
      throw new HttpError(400, "status inválido");
    }
    where.status = filters.status as RentalStatus;
  }

  if (filters.overdue) {
    where.endDate = { lt: new Date() };
    where.status = { in: [RentalStatus.PENDING, RentalStatus.ACTIVE] };
  }

  const term = filters.q?.trim();
  if (term) {
    where.OR = [
      { game: { title: { contains: term, mode: "insensitive" } } },
      { user: { name: { contains: term, mode: "insensitive" } } },
      { user: { email: { contains: term, mode: "insensitive" } } },
      { copy: { code: { contains: term, mode: "insensitive" } } },
      { gameTitleSnapshot: { contains: term, mode: "insensitive" } },
    ];
  }

  const { page, limit } = filters;

  const [rentals, total] = await Promise.all([
    prisma.rental.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { startDate: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, avatar: true, picture: true } },
        game: { select: { id: true, title: true, cover: true, price: true } },
        copy: { select: { id: true, code: true, number: true, condition: true } },
      },
    }),
    prisma.rental.count({ where }),
  ]);

  const data = rentals.map((r) => ({
    ...r,
    game: r.game ? r.game : { id: null, title: r.gameTitleSnapshot, cover: r.gameCoverSnapshot, price: null },
    copy: r.copy
      ? r.copy
      : r.copyCodeSnapshot || r.copyNumberSnapshot
      ? { id: null, code: r.copyCodeSnapshot, number: r.copyNumberSnapshot, condition: null }
      : null,
  }));

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function updateRentalStatus(adminId: string, rentalId: string, input: UpdateRentalStatusInput) {
  const { status, applyPenalty, penaltyReason } = input;

  if (!ADMIN_SETTABLE_STATUSES.includes(status)) {
    throw new HttpError(400, "status inválido");
  }

  const { updated, previousStatus, gameTitle } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Rental" WHERE id = ${rentalId} FOR UPDATE`;

    const rental = await tx.rental.findUnique({
      where: { id: rentalId },
      include: { game: { select: { id: true, title: true } } },
    });

    if (!rental) {
      throw new HttpError(404, "Aluguel não encontrado");
    }

    if (rental.status === status) {
      throw new HttpError(409, "Este aluguel já está com este status.", "SAME_STATUS");
    }

    if (FINALIZED_STATUSES.includes(rental.status)) {
      throw new HttpError(409, "Aluguel já finalizado", "RENTAL_FINALIZED");
    }

    if (
      status === RentalStatus.ACTIVE &&
      rental.status === RentalStatus.PENDING &&
      Date.now() < rental.startDate.getTime() - ACTIVATION_TOLERANCE_MS
    ) {
      throw new HttpError(
        400,
        "Muito cedo para ativar. A retirada só pode ser confirmada no horário agendado.",
        "TOO_EARLY_TO_ACTIVATE",
      );
    }

    // Devolução com avaria bloqueia o exemplar para manutenção.
    if (status === RentalStatus.RETURNED && applyPenalty && rental.copyId) {
      await tx.gameCopy.update({
        where: { id: rental.copyId },
        data: {
          available: false,
          observations: penaltyReason
            ? `Bloqueio automático (Avaria): ${penaltyReason}`
            : "Bloqueio automático: Devolvido com avaria de componentes",
        },
      });
    }

    const updated = await tx.rental.update({
      where: { id: rental.id },
      data: { status },
    });

    return { updated, previousStatus: rental.status, gameTitle: rental.game?.title || rental.gameTitleSnapshot };
  });

  await logAdminAction(adminId, `CHANGE_RENTAL_STATUS_${status}`, updated.id, {
    applyPenalty,
    penaltyReason,
    targetUserId: updated.userId,
  });

  if ((status === RentalStatus.RETURNED || status === RentalStatus.CANCELED) && updated.gameId) {
    notifyGameBackAvailable(updated.gameId).catch((err) =>
      console.error("Erro ao notificar disponibilidade:", err),
    );
  }

  if (status === RentalStatus.ACTIVE && previousStatus === RentalStatus.PENDING) {
    await rewardPickup(updated, gameTitle);
  }

  if (status === RentalStatus.RETURNED && previousStatus === RentalStatus.ACTIVE) {
    await settleReturn(updated, gameTitle, applyPenalty, penaltyReason);
  }

  return updated;
}

type UpdatedRental = { id: string; userId: string; endDate: Date };

async function rewardPickup(rental: UpdatedRental, gameTitle: string) {
  try {
    await addUserPoints({
      userId: rental.userId,
      delta: 5,
      reason: `RENTAL_CONFIRMED_BY_ADMIN:${rental.id}`,
    });

    await notifyUser({
      userId: rental.userId,
      type: NotificationType.RENTAL_CREATED,
      title: "Aluguel Confirmado!",
      body: `Sua retirada de "${gameTitle}" foi confirmada. O prazo de devolução é ${rental.endDate.toLocaleDateString("pt-BR")}.`,
      channelId: "rentals",
      data: { route: "/rentals", rentalId: rental.id },
    });

    await incrementRentalCountAndMaybePromote(rental.userId);
  } catch (err) {
    console.error("Erro ao processar pontos ou notificação de confirmação:", err);
  }
}

async function settleReturn(
  rental: UpdatedRental,
  gameTitle: string,
  applyPenalty?: boolean,
  penaltyReason?: string,
) {
  try {
    if (applyPenalty) {
      await applyConservationPenalty(rental.userId);

      await notifyUser({
        userId: rental.userId,
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        title: "Atenção: Penalidade Aplicada",
        body: `O jogo "${gameTitle}" foi devolvido com problemas: ${penaltyReason || "Componentes danificados ou perdidos"}. Você sofreu uma penalidade de -20 pontos.`,
        channelId: "system",
        data: { route: "/ranking" },
      });
      return;
    }

    const isOverdue = new Date() > rental.endDate;
    const pointsDelta = isOverdue ? 2 : 5;
    const reasonPrefix = isOverdue ? "RENTAL_RETURNED_LATE" : "RENTAL_RETURNED_ON_TIME";

    await addUserPoints({
      userId: rental.userId,
      delta: pointsDelta,
      reason: `${reasonPrefix}:${rental.id}`,
    });

    await notifyUser({
      userId: rental.userId,
      type: NotificationType.RENTAL_RETURN_CONFIRMED,
      title: isOverdue ? "Jogo Devolvido com Atraso ⚠️" : "Parabéns pela Devolução!",
      body: isOverdue
        ? `Você devolveu "${gameTitle}" com atraso e recebeu apenas ${pointsDelta} pontos. Cuidado para não perder o prazo!`
        : `Obrigado por devolver "${gameTitle}" no prazo e com cuidado! Você ganhou ${pointsDelta} pontos.`,
      channelId: "rentals",
      data: { route: "/rentals" },
    });
  } catch (err) {
    console.error("Erro ao processar pontos ou notificação de devolução:", err);
  }
}
