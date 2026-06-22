import { prisma } from "../lib/prisma";
import { NotificationType } from "@prisma/client";
import { notifyUser } from "./notify.service";
import { sendPushToUser } from "./push.service";

type LevelConfig = {
  level: number;
  name: string;
  minPoints: number;
};

// Se quiser deixar ainda mais difícil subir de nível, é só aumentar o minPoints!
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

/**
 * Função Core (Lida com banco, logs e disparo de notificações gerais)
 */
export async function addUserPoints(params: {
  userId: string;
  delta: number;
  reason: string;
}) {
  const { userId, delta, reason } = params;

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, points: true, level: true },
    });
    if (!user) throw new Error("User not found");

    const prevPoints = user.points ?? 0;
    const prevLevel = user.level ?? 1;

    // Garante que o usuário nunca fique com pontos negativos
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
      leveledDown: nextLevel < prevLevel, // Caso perca tanto ponto que caia de rank
    };
  });

  // ========== SISTEMA DE NOTIFICAÇÕES ==========
  try {
    // 1. Ganhou pontos (Notificação Feliz)
    if (delta > 0) {
      await notifyUser({
        userId,
        type: NotificationType.POINTS_EARNED,
        title: "Pontos recebidos ✨",
        body: `Você ganhou +${delta} pontos! Motivo: ${reason}`,
        channelId: "system",
        data: { route: "/ranking", delta, reason },
        dedupeKey: `POINTS_EARNED:${userId}:${Date.now()}`,
      });

      await sendPushToUser({
        userId,
        title: "Pontos recebidos ✨",
        body: `Você ganhou +${delta} pontos!`,
        channelId: "system",
        data: { route: "/ranking" },
      });
    } 
    
    // 2. Perdeu pontos (Notificação de Punição)
    else if (delta < 0) {
      await notifyUser({
        userId,
        type: "SYSTEM_ANNOUNCEMENT" as NotificationType,
        title: "Punição Aplicada 📉",
        body: `Você perdeu ${Math.abs(delta)} pontos. Motivo: ${reason}`,
        channelId: "system",
        data: { route: "/ranking", delta, reason },
        dedupeKey: `POINTS_LOST:${userId}:${Date.now()}`,
      });

      await sendPushToUser({
        userId,
        title: "Atenção: Pontos perdidos 📉",
        body: `Você perdeu ${Math.abs(delta)} pontos.`,
        channelId: "system",
        data: { route: "/ranking" },
      });
    }

    // 3. Subiu de Nível
    if (result.leveledUp) {
      const levelName = getLevelName(result.nextLevel);

      await notifyUser({
        userId,
        type: NotificationType.LEVEL_UP,
        title: "Você subiu de nível! 🏆",
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
        title: "Você subiu de nível! 🏆",
        body: `Agora você é ${levelName} (Nível ${result.nextLevel}).`,
        channelId: "system",
        data: { route: "/ranking" },
      });
    }
  } catch (e) {
    console.error("Falha ao notificar pontos/level:", e);
  }

  return result.updated;
}

// =========================================================================
// REGRAS DE NEGÓCIO HARDCORE (CHAME ESTAS FUNÇÕES NOS SEUS CONTROLLERS)
// =========================================================================

/**
 * Aplica os pontos de devolução baseados no Peso (Tier) e se houve atraso.
 */
export async function applyRentalReturnPoints(userId: string, gameTier: string | null, isLate: boolean) {
  // Atrasou? Perde ponto sem choro!
  if (isLate) {
    return addUserPoints({
      userId,
      delta: -5,
      reason: "Atraso na devolução do jogo na biblioteca.",
    });
  }

  // Se entregou no prazo, ganha de acordo com o peso do jogo
  let pts = 5; // Padrão
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

/**
 * Punição por cancelamento ("Ghosting"). Agendou e cancelou? Perde ponto.
 */
export async function applyCancellationPenalty(userId: string) {
  return addUserPoints({
    userId,
    delta: -2,
    reason: "Cancelamento de reserva (A caixa ficou travada no sistema).",
  });
}

/**
 * Bônus opcional se o bibliotecário constatar que o jogo voltou impecável.
 */
export async function applyConservationBonus(userId: string) {
  return addUserPoints({
    userId,
    delta: 5,
    reason: "Bônus de Conservação: Caixa devolvida em estado impecável!",
  });
}

/**
 * Punição pesada se o jogo voltar rasgado, faltando peça, ou sujo.
 */
export async function applyConservationPenalty(userId: string) {
  return addUserPoints({
    userId,
    delta: -20,
    reason: "Penalidade grave: Danos, sujeira ou perda de componentes do jogo.",
  });
}