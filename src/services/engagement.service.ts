import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma";
import { NotificationType } from "@prisma/client";
import { notifyUser } from "./notify.service";
import { sendPushToUser } from "./push.service";

type LevelConfig = {
  level: number;
  name: string;
  minPoints: number;
};

const LEVELS: LevelConfig[] = [
  { level: 1, name: "Iniciante", minPoints: 0 },
  { level: 2, name: "Explorador", minPoints: 100 },
  { level: 3, name: "Estrategista", minPoints: 300 },
  { level: 4, name: "Campeão", minPoints: 700 },
  { level: 5, name: "Lenda", minPoints: 1500 },
];

export function getLevelByPoints(points: number) {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (points >= lvl.minPoints) current = lvl;
  }
  return current;
}

export function getLevelName(level: number) {
  const found = LEVELS.find((l) => l.level === level);
  return found?.name ?? "Iniciante";
}

export function getLevelsConfig() {
  return LEVELS;
}

export async function addUserPoints(params: {
  userId: string;
  delta: number;
  reason: string;
}) {
  const { userId, delta, reason } = params;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, points: true, level: true },
    });

    if (!user) throw new Error("User not found");

    const prevPoints = user.points ?? 0;
    const prevLevel = user.level ?? 1;

    const nextPoints = Math.max(0, prevPoints + delta);
    const nextLevel = getLevelByPoints(nextPoints).level;

    await tx.userPointsLog.create({
      data: { userId, points: delta, reason },
    });

    const updated = await tx.user.update({
      where: { id: userId },
      data: { points: nextPoints, level: nextLevel },
      select: { id: true, name: true, points: true, level: true },
    });

    return {
      updated,
      prevPoints,
      prevLevel,
      nextPoints,
      nextLevel,
      leveledUp: nextLevel > prevLevel,
      leveledDown: nextLevel < prevLevel, 
    };
  });

  try {
    if (delta > 0) {
      await notifyUser({
        userId,
        type: NotificationType.POINTS_EARNED,
        title: "Pontos recebidos!",
        body: `Você ganhou +${delta} pontos! Motivo: ${reason}`,
        channelId: "system",
        data: { route: "/ranking", delta, reason },
        dedupeKey: `POINTS_EARNED:${userId}:${Date.now()}`,
      });

      await sendPushToUser({
        userId,
        title: "Pontos recebidos!",
        body: `Você ganhou +${delta} pontos!`,
        channelId: "system",
        data: { route: "/ranking" },
      });
    } 
    else if (delta < 0) {
      await notifyUser({
        userId,
        type: "SYSTEM_ANNOUNCEMENT" as NotificationType,
        title: "Punição Aplicada!",
        body: `Você perdeu ${Math.abs(delta)} pontos. Motivo: ${reason}`,
        channelId: "system",
        data: { route: "/ranking", delta, reason },
        dedupeKey: `POINTS_LOST:${userId}:${Date.now()}`,
      });

      await sendPushToUser({
        userId,
        title: "Atenção: Pontos perdidos!",
        body: `Você perdeu ${Math.abs(delta)} pontos.`,
        channelId: "system",
        data: { route: "/ranking" },
      });
    }

    if (result.leveledUp) {
      const levelName = getLevelName(result.nextLevel);
      
      await notifyUser({
        userId,
        type: NotificationType.LEVEL_UP,
        title: "Você subiu de nível! 🎉",
        body: `Incrível! Agora você é ${levelName} (Nível ${result.nextLevel}).`,
        channelId: "system",
        data: {
          route: "/ranking",
          level: result.nextLevel,
          levelName,
          points: result.nextPoints,
        },
        dedupeKey: `LEVEL_UP:${userId}:${result.nextLevel}`,
      });

      await sendPushToUser({
        userId,
        title: "Você subiu de nível! 🎉",
        body: `Agora você é ${levelName} (Nível ${result.nextLevel}).`,
        channelId: "system",
        data: { route: "/ranking" },
      });

      if (result.nextLevel >= 2) {
        try {
          const admins = await prisma.user.findMany({
            where: { role: "ADMIN" },
            select: { id: true }
          });

          for (const admin of admins) {
            await notifyUser({
              userId: admin.id,
              type: NotificationType.SYSTEM_ANNOUNCEMENT,
              title: "Cupons Pendentes 🎟️",
              body: `O aluno ${result.updated.name} alcançou o Nível ${result.nextLevel}. Acesse o painel para gerar a recompensa.`,
              channelId: "system",
              data: { route: "temporadas" }
            });
          }
        } catch (adminErr) {
          console.error("Erro ao notificar admins sobre cupons:", adminErr);
        }
      }
    }
  } catch (e) {
    console.error("Falha ao notificar pontos/level:", e);
  }

  return result.updated;
}

export async function applyRentalReturnPoints(userId: string, gameTier: string | null, isLate: boolean) {
  if (isLate) {
    return addUserPoints({
      userId,
      delta: -5,
      reason: "Atraso na devolução do jogo na biblioteca.",
    });
  }

  let pts = 5; 
  switch (gameTier) {
    case "LATAO": pts = 3; break;
    case "BRONZE": pts = 5; break;
    case "PRATA": pts = 8; break;
    case "OURO": pts = 10; break;
    case "DIAMANTE": pts = 15; break;
  }

  return addUserPoints({
    userId,
    delta: pts,
    reason: `Devolução no prazo (Jogo Categoria ${gameTier || 'Padrão'}).`,
  });
}

export async function applyCancellationPenalty(userId: string) {
  return addUserPoints({
    userId,
    delta: -2,
    reason: "Cancelamento de reserva (A caixa ficou travada no sistema).",
  });
}

export async function applyNoShowPenalty(userId: string) {
  return addUserPoints({
    userId,
    delta: -5,
    reason: "Não comparecimento. O jogo foi reservado, mas não foi retirado no prazo.",
  });
}

export async function applyConservationBonus(userId: string) {
  return addUserPoints({
    userId,
    delta: 5,
    reason: "Bônus de Conservação: Caixa devolvida em estado impecável!",
  });
}

export async function applyConservationPenalty(userId: string) {
  return addUserPoints({
    userId,
    delta: -20,
    reason: "Penalidade grave: Danos, sujeira ou perda de componentes do jogo.",
  });
}

export async function generateUniqueCouponCode(prefix: string): Promise<string> {
  let code = "";
  let isUnique = false;
  let attempts = 0;

  while (!isUnique && attempts < 5) {
    code = `${prefix}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (!existing) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    throw new Error("Não foi possível gerar um código de cupom único após 5 tentativas.");
  }

  return code;
}

export async function generateSeasonCouponsForUsers(userIds: string[], seasonId: string) {
  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season) throw new Error("Temporada não encontrada.");

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } }
  });

  const pointsLogs = await prisma.userPointsLog.groupBy({
    by: ["userId"],
    where: {
      userId: { in: userIds },
      createdAt: {
        gte: season.startDate,
        lte: season.endDate,
      }
    },
    _sum: { points: true }
  });

  const pointsMap = new Map(pointsLogs.map(l => [l.userId, l._sum.points || 0]));

  const rewardLevels = [2, 3, 4, 5];
  const now = new Date();
  const isSeasonActive = now >= season.startDate && now <= season.endDate;

  const rewards = (season.rewards as Record<string, any>) || {};
  let count = 0;
  
  const generatedLevelsPerUser: Record<string, number[]> = {};

  for (const user of users) {
    const seasonPoints = isSeasonActive ? Math.max(pointsMap.get(user.id) || 0, user.points) : (pointsMap.get(user.id) || 0);
    const seasonLevel = isSeasonActive ? Math.max(getLevelByPoints(seasonPoints).level, user.level) : getLevelByPoints(seasonPoints).level;
    
    const reachedLevels: number[] = rewardLevels.filter((l: number) => l <= seasonLevel);
    
    const existingCoupons: { type: string }[] = await prisma.coupon.findMany({
      where: { userId: user.id, seasonId: season.id },
      select: { type: true }
    });

    const alreadyGeneratedLevels: number[] = existingCoupons
      .map((c: { type: string }) => {
        const match = c.type.match(/^REWARD_LEVEL_(\d+)$/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((l: number | null): l is number => l !== null);

    const pendingLevels: number[] = reachedLevels.filter((l: number) => !alreadyGeneratedLevels.includes(l));
    
    generatedLevelsPerUser[user.id] = pendingLevels;

    for (const lvl of pendingLevels) {
      const levelKey = `nivel${lvl}`;
      const userReward = rewards[levelKey]?.cuponsGerados?.[0];
      
      if (!userReward) continue;

      const prefix = `NVL${lvl}-S${season.name.replace(/\D/g, "")}`;
      
      const code = await generateUniqueCouponCode(prefix);

      await prisma.coupon.create({
        data: {
          code,
          type: `REWARD_LEVEL_${lvl}`,
          value: userReward.valor || 100,
          description: userReward.descricao || `Recompensa do Nível ${lvl}`,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          userId: user.id,
          seasonId: season.id
        }
      });

      await notifyUser({
        userId: user.id,
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        title: "Recompensa de Temporada!",
        body: `Você bateu a meta e ganhou o cupom do Nível ${lvl}: ${code}. Aproveite!`,
        channelId: "system",
      });

      count++;
    }
  }

  return { count, generatedLevelsPerUser };
}

export async function generatePendingLevelCoupons(userId: string) {
  const now = new Date();
  const activeSeason = await prisma.season.findFirst({
    where: { startDate: { lte: now }, endDate: { gte: now } }
  });

  if (!activeSeason) {
    return { message: "Nenhuma temporada ativa para gerar recompensas." };
  }

  const result = await generateSeasonCouponsForUsers([userId], activeSeason.id);

  if (result.count === 0) {
    return { message: "Todos os cupons pendentes já foram gerados ou o usuário não atingiu níveis de recompensa." };
  }

  return {
    message: `${result.count} cupons gerados com sucesso!`,
    levelsGenerated: result.generatedLevelsPerUser[userId] || []
  };
}