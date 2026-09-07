import { ClientCategory, GameTier, NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { notifyUser } from "./notify.service";
import { sendPushToUser } from "./push.service";

export const GAME_TIER_LABELS: Record<GameTier, string> = {
  LATAO: "Latão",
  BRONZE: "Bronze",
  PRATA: "Prata",
  OURO: "Ouro",
  DIAMANTE: "Diamante",
};

export const CLIENT_CATEGORY_LABELS: Record<ClientCategory, string> = {
  STARTER: "Cliente Starter",
  FAMILY: "Cliente Family",
  EXPERT: "Cliente Expert",
  ULTRAGAMER: "Cliente Ultragamer",
};

export const ALLOWED_TIERS: Record<ClientCategory, GameTier[]> = {
  STARTER: ["LATAO", "BRONZE"],
  FAMILY: ["LATAO", "BRONZE", "PRATA"],
  EXPERT: ["LATAO", "BRONZE", "PRATA", "OURO"],
  ULTRAGAMER: ["LATAO", "BRONZE", "PRATA", "OURO", "DIAMANTE"],
};

export function canClientRentTier(
  clientCategory: ClientCategory,
  gameTier: GameTier
): boolean {
  return ALLOWED_TIERS[clientCategory].includes(gameTier);
}

const CATEGORY_ORDER: ClientCategory[] = [
  "STARTER",
  "FAMILY",
  "EXPERT",
  "ULTRAGAMER",
];


export function getCategoryByRentalsCount(count: number): ClientCategory {
  if (count >= 61) return "ULTRAGAMER";
  if (count >= 31) return "EXPERT";
  if (count >= 11) return "FAMILY";
  return "STARTER";
}

export async function incrementRentalCountAndMaybePromote(
  userId: string
): Promise<void> {
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        clientCategory: true,
        totalRentalsCount: true,
      },
    });

    if (!user) throw new Error("Usuário não encontrado");

    const newCount = (user.totalRentalsCount ?? 0) + 1;
    const newCategory = getCategoryByRentalsCount(newCount);
    const shouldPromote = newCategory !== user.clientCategory;

    await tx.user.update({
      where: { id: userId },
      data: {
        totalRentalsCount: newCount,
        clientCategory: newCategory,
      },
    });

    return {
      promoted: shouldPromote && CATEGORY_ORDER.indexOf(newCategory) > CATEGORY_ORDER.indexOf(user.clientCategory),
      newCategory,
      newCount,
      name: user.name,
    };
  });

  if (result.promoted) {
    const categoryLabel = CLIENT_CATEGORY_LABELS[result.newCategory];
    try {
      await notifyUser({
        userId,
        type: NotificationType.LEVEL_UP,
        title: "Categoria desbloqueada! 🎉",
        body: `Parabéns! Você alcançou ${result.newCount} aluguéis e agora é ${categoryLabel}. Novos jogos liberados!`,
        channelId: "system",
        data: {
          route: "/profile",
          clientCategory: result.newCategory,
          categoryLabel,
          totalRentals: result.newCount,
        },
        dedupeKey: `CLIENT_CATEGORY_UP:${userId}:${result.newCategory}`,
      });

      await sendPushToUser({
        userId,
        title: "Nova categoria desbloqueada! 🎉",
        body: `Você agora é ${categoryLabel}!`,
        channelId: "system",
        data: { route: "/profile" },
      });
    } catch (e) {
      console.error("Falha ao notificar promoção de categoria:", e);
    }
  }
}

export async function setClientCategoryAdmin(
  userId: string,
  newCategory: ClientCategory
): Promise<{ clientCategory: ClientCategory }> {
  const oldUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { clientCategory: true },
  });

  if (!oldUser) {
    throw new Error("Usuário não encontrado");
  }

  
  let newCount = 0;
  if (newCategory === "FAMILY") newCount = 11;
  if (newCategory === "EXPERT") newCount = 31;
  if (newCategory === "ULTRAGAMER") newCount = 61;

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      clientCategory: newCategory,
      totalRentalsCount: newCount,
    },
    select: { id: true, clientCategory: true },
  });

  const oldCategoryIdx = CATEGORY_ORDER.indexOf(oldUser.clientCategory);
  const newCategoryIdx = CATEGORY_ORDER.indexOf(newCategory);

  if (oldCategoryIdx !== newCategoryIdx) {
    const isUpgrade = newCategoryIdx > oldCategoryIdx;
    const categoryLabel = CLIENT_CATEGORY_LABELS[newCategory];

    const title = isUpgrade ? "Categoria atualizada! 🎉" : "Ajuste de Categoria ⚠️";
    const body = isUpgrade
      ? `A administração concedeu um bônus! Agora você é ${categoryLabel} e tem novos jogos liberados.`
      : `Sua categoria foi ajustada para ${categoryLabel} e sua contagem de aluguéis foi sincronizada.`;

    const notificationType = isUpgrade
      ? NotificationType.LEVEL_UP
      : NotificationType.SYSTEM_ANNOUNCEMENT;

    try {
      await notifyUser({
        userId,
        type: notificationType,
        title,
        body,
        channelId: "system",
        data: {
          route: "/profile",
          clientCategory: newCategory,
          categoryLabel,
        },
      });

      await sendPushToUser({
        userId,
        title,
        body,
        channelId: "system",
        data: { route: "/profile" },
      });
    } catch (e) {
      console.error("Falha ao notificar mudança manual de categoria:", e);
    }
  }

  return { clientCategory: user.clientCategory };
}