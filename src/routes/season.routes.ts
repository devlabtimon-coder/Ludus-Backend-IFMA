import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";
import { getLevelName, getLevelByPoints, generateSeasonCouponsForUsers } from "../services/engagement.service";

export const seasonRoutes = Router();

export function parseQueryString(value: any): string | undefined {
  if (Array.isArray(value)) return String(value[0]);
  if (typeof value === "string") return value;
  return undefined;
}

const MAX_SEASON_POINTS = 1500;

export function calculateSeasonLevel(points: number): number {
  return getLevelByPoints(Math.max(0, points)).level;
}

function getStartOfDay(dateInput: string | Date): Date {
  const dateStr = typeof dateInput === "string" ? dateInput.split("T")[0] : dateInput.toISOString().split("T")[0];
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));
}

function getEndOfDay(dateInput: string | Date): Date {
  const dateStr = typeof dateInput === "string" ? dateInput.split("T")[0] : dateInput.toISOString().split("T")[0];
  const [y, m, d] = dateStr.split("-").map(Number);
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0, 0));
  return new Date(nextDay.getTime() - 1);
}

const DEFAULT_REWARDS = {
  nivel2: { cuponsGerados: [{ tipo: "percentual", valor: 5, descricao: "Cupom 5% OFF - Nível 2" }] },
  nivel3: { cuponsGerados: [{ tipo: "percentual", valor: 10, descricao: "Cupom 10% OFF - Nível 3" }] },
  nivel4: { cuponsGerados: [{ tipo: "fixo", valor: 15, descricao: "R$ 15 OFF - Nível 4" }] },
  nivel5: { cuponsGerados: [{ tipo: "percentual", valor: 25, descricao: "Cupom 25% OFF - Lenda!" }] },
};

async function generateSeasonSnapshot(seasonId: string) {
  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season) return;

  const searchStart = season.startDate;
  const searchEnd = season.endDate;

  const users = await prisma.user.findMany({
    where: { role: "USER", isBlocked: false },
    select: { id: true, points: true }
  });

  const logs = await prisma.userPointsLog.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: searchStart, lte: searchEnd } },
    _sum: { points: true }
  });
  const logMap = new Map(logs.map(l => [l.userId, l._sum.points || 0]));

  const rentals = await prisma.rental.groupBy({
    by: ["userId"],
    where: {
      OR: [
        { startDate: { gte: searchStart, lte: searchEnd } },
        { endDate: { gte: searchStart, lte: searchEnd } }
      ],
      status: { not: "CANCELED" }
    },
    _count: { id: true }
  });
  const rentalMap = new Map(rentals.map(r => [r.userId, r._count.id]));

  const userStats = users.map(u => {
    const logPoints = logMap.get(u.id) || 0;
    // O pulo do gato: confia sempre no maior número para não perder pontos manuais
    const finalPoints = Math.max(0, logPoints, u.points);
    
    return {
      userId: u.id,
      finalPoints,
      finalLevel: calculateSeasonLevel(finalPoints),
      rentalsCount: rentalMap.get(u.id) || 0
    };
  }).sort((a, b) => b.finalPoints - a.finalPoints);

  const standingsData = userStats.map((stat, index) => ({
    seasonId: season.id,
    userId: stat.userId,
    finalPoints: stat.finalPoints,
    finalLevel: stat.finalLevel,
    rentalsCount: stat.rentalsCount,
    rank: index + 1
  }));

  await prisma.$transaction(async (tx) => {
    await tx.seasonStanding.deleteMany({ where: { seasonId: season.id } });
    if (standingsData.length > 0) {
      await tx.seasonStanding.createMany({ data: standingsData });
    }
  });

  try {
    const eligibleUserIds = userStats.filter(u => u.finalLevel >= 2).map(u => u.userId);
    if (eligibleUserIds.length > 0) {
      await generateSeasonCouponsForUsers(eligibleUserIds, season.id);
    }
  } catch (e) {
    console.error("Erro ao gerar cupons no fechamento da temporada:", e);
  }
}

seasonRoutes.get("/", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const seasons = await prisma.season.findMany({
    orderBy: { startDate: "desc" }
  });
  const now = new Date();
  const mapped = seasons.map(s => {
    let status = "encerrada";
    if (now >= s.startDate && now <= s.endDate) status = "ativa";
    else if (now < s.startDate) status = "proxima";
    return {
      ...s,
      status,
      banner: { corPrimaria: "#2D2D8C", corSecundaria: "#FBBC04" }
    };
  });
  return res.json(mapped);
});

seasonRoutes.get("/coupons", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const coupons = await prisma.coupon.findMany({
    include: { 
      user: { select: { name: true, level: true } }, 
      season: { select: { name: true } } 
    },
    orderBy: { createdAt: "desc" }
  });
  const mapped = coupons.map(c => ({
    id: c.id,
    usuario: c.user.name,
    nivel: getLevelName(c.user.level),
    temporada: c.season?.name || "Avulso",
    codigo: c.code,
    tipo: c.type === "percentual" ? "Percentual" : c.type === "fixo" ? "Valor Fixo" : "Vale-Brinde",
    valor: c.type === "percentual" ? `${c.value}% OFF` : c.type === "fixo" ? `R$ ${c.value} OFF` : "Item Físico",
    emitidoEm: c.createdAt.toISOString().split("T")[0],
    expiraEm: c.expiresAt.toISOString().split("T")[0],
    status: c.isUsed ? "utilizado" : (new Date() > c.expiresAt ? "expirado" : "ativo")
  }));
  return res.json(mapped);
});

seasonRoutes.post("/", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { nome, dataInicio, dataFim, recompensas, overrideActive } = req.body;
  if (!nome || !dataInicio || !dataFim) {
    return res.status(400).json({ error: "Nome, data de início e fim são obrigatórios." });
  }

  const startDate = getStartOfDay(dataInicio);
  const endDate = getEndOfDay(dataFim);
  const now = new Date();

  if (startDate <= now && endDate >= now) {
    const existingActive = await prisma.season.findFirst({
      where: {
        startDate: { lte: now },
        endDate: { gte: now }
      }
    });
    if (existingActive && !overrideActive) {
      return res.status(409).json({
        error: `A "${existingActive.name}" está ativa no momento. Deseja encerrá-la e zerar os pontos de todos os alunos agora?`,
        code: "ACTIVE_SEASON_EXISTS"
      });
    }
  }

  const season = await prisma.season.create({
    data: {
      name: nome,
      startDate,
      endDate,
      rewards: recompensas || DEFAULT_REWARDS,
    }
  });

  if (startDate <= now && endDate >= now) {
    const activeSeasonsToClose = await prisma.season.findMany({
      where: {
        id: { not: season.id },
        startDate: { lte: now },
        endDate: { gte: now }
      }
    });

    for (const act of activeSeasonsToClose) {
      await prisma.season.update({
        where: { id: act.id },
        data: { endDate: new Date(now.getTime() - 1000) } 
      });
      await generateSeasonSnapshot(act.id);
    }

    await prisma.user.updateMany({
      where: { role: "USER" },
      data: { points: 0, level: 1 }
    });
  }

  return res.status(201).json(season);
});

seasonRoutes.get("/:id/progress", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const seasonId = parseQueryString(req.params.id);
  if (!seasonId) return res.status(400).json({ error: "ID da temporada inválido." });

  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season) return res.status(404).json({ error: "Temporada não encontrada." });

  const searchStart = season.startDate;
  const searchEnd = season.endDate;
  const now = new Date();
  const isSeasonActive = now >= searchStart && now <= searchEnd;

  const users = await prisma.user.findMany({
    where: { role: "USER", isBlocked: false },
    select: { id: true, name: true, level: true, points: true, clientCategory: true, avatar: true, picture: true }
  });

  const rentals = await prisma.rental.findMany({
    where: {
      OR: [
        { startDate: { gte: searchStart, lte: searchEnd } },
        { endDate: { gte: searchStart, lte: searchEnd } },
        {
          AND: [
            { startDate: { lte: searchEnd } },
            { endDate: { gte: searchStart } }
          ]
        }
      ],
      status: { not: "CANCELED" }
    },
    include: {
      game: { select: { title: true, cover: true } }
    }
  });

  const penalties = await prisma.userPointsLog.findMany({
    where: { points: { lt: 0 }, createdAt: { gte: searchStart, lte: searchEnd } }
  });
  
  const generatedCoupons = await prisma.coupon.findMany({
    where: { seasonId: season.id },
    select: { userId: true, code: true }
  });

  const userCouponsMap = new Map<string, number[]>();
  for (const c of generatedCoupons) {
    const match = c.code.match(/^NIVEL(\d+)-/);
    if (match) {
      const lvl = parseInt(match[1], 10);
      const list = userCouponsMap.get(c.userId) || [];
      list.push(lvl);
      userCouponsMap.set(c.userId, list);
    }
  }

  const pointsMap = new Map<string, number>();
  const levelMap = new Map<string, number>();

  if (!isSeasonActive) {
    let standings = await prisma.seasonStanding.findMany({ where: { seasonId } });
    if (standings.length === 0) {
      await generateSeasonSnapshot(seasonId);
      standings = await prisma.seasonStanding.findMany({ where: { seasonId } });
    }
    standings.forEach(st => {
      pointsMap.set(st.userId, st.finalPoints);
      levelMap.set(st.userId, st.finalLevel);
    });
  } else {
    const pointsLogs = await prisma.userPointsLog.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: searchStart, lte: searchEnd } },
      _sum: { points: true }
    });
    const logMap = new Map(pointsLogs.map(p => [p.userId, p._sum.points || 0]));
    users.forEach(u => {
      const raw = Math.max(logMap.get(u.id) || 0, u.points);
      const pts = Math.max(0, raw);
      pointsMap.set(u.id, pts);
      levelMap.set(u.id, Math.max(calculateSeasonLevel(pts), u.level));
    });
  }

  const rewardLevels: number[] = [2, 3, 4, 5];

  const progressData = users.map(user => {
    const userRentals = rentals.filter(r => r.userId === user.id);
    const multas = penalties.filter(p => p.userId === user.id).length;
    
    const alugueis = userRentals.length;
    const diasSemAtraso = userRentals.reduce((acc, curr) => {
      const diffTime = Math.abs(curr.endDate.getTime() - curr.startDate.getTime());
      return acc + Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }, 0);

    const seasonPoints = pointsMap.get(user.id) || 0;
    const seasonLevel = levelMap.get(user.id) || 1;
    const pct = Math.min(100, Math.max(0, Math.round((seasonPoints / MAX_SEASON_POINTS) * 100)));
    const reachedLevels = rewardLevels.filter(lvl => lvl <= seasonLevel);
    const generatedLevels = userCouponsMap.get(user.id) || [];
    const allCouponsIssued = reachedLevels.length > 0 && reachedLevels.every(lvl => generatedLevels.includes(lvl));
    const jogosAlugados = Array.from(new Set(
      userRentals.map(r => r.gameTitleSnapshot || r.game?.title).filter(Boolean)
    ));

    return {
      id: user.id,
      nome: user.name,
      avatar: user.avatar || user.picture || null,
      nivel: user.clientCategory.toLowerCase(),
      currentLevel: seasonLevel,
      alugueis,
      alugueisMax: 0,
      diasSemAtraso,
      diasMax: 0,
      avaliacoes: seasonPoints,
      avaliacoesMax: MAX_SEASON_POINTS,
      multas,
      pct,
      cupomEmitido: allCouponsIssued,
      cuponsEmitidos: generatedLevels,
      jogosAlugados,
    };
  });

  return res.json(progressData);
});

seasonRoutes.post("/:id/generate-coupons", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const seasonId = parseQueryString(req.params.id);
  if (!seasonId) return res.status(400).json({ error: "ID da temporada inválido." });

  const { eligibleUserIds } = req.body;
  if (!Array.isArray(eligibleUserIds) || eligibleUserIds.length === 0) {
    return res.status(400).json({ error: "Nenhum usuário elegível informado." });
  }

  const result = await generateSeasonCouponsForUsers(eligibleUserIds, seasonId);
  if (result.count === 0) {
    return res.status(400).json({ error: "Todos os cupons pendentes já foram gerados para os usuários selecionados." });
  }

  return res.json({ message: `${result.count} cupons gerados com sucesso!`, count: result.count });
});

seasonRoutes.get("/:id/ranking", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const seasonId = parseQueryString(req.params.id);
  if (!seasonId) return res.status(400).json({ error: "ID da temporada inválido." });

  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season) return res.status(404).json({ error: "Temporada não encontrada." });

  const searchStart = season.startDate;
  const searchEnd = season.endDate;
  const now = new Date();
  const isSeasonActive = now >= searchStart && now <= searchEnd;

  const users = await prisma.user.findMany({
    where: { role: "USER", isBlocked: false },
    select: { id: true, name: true, email: true, avatar: true, picture: true, clientCategory: true, points: true, level: true }
  });

  const rentals = await prisma.rental.findMany({
    where: {
      OR: [
        { startDate: { gte: searchStart, lte: searchEnd } },
        { endDate: { gte: searchStart, lte: searchEnd } },
      ],
      status: { not: "CANCELED" }
    },
    select: { userId: true, gameTitleSnapshot: true, game: { select: { title: true } } }
  });

  const pointsMap = new Map<string, number>();
  const levelMap = new Map<string, number>();

  if (!isSeasonActive) {
    let standings = await prisma.seasonStanding.findMany({ where: { seasonId } });
    if (standings.length === 0) {
      await generateSeasonSnapshot(seasonId);
      standings = await prisma.seasonStanding.findMany({ where: { seasonId } });
    }
    standings.forEach(st => {
      pointsMap.set(st.userId, st.finalPoints);
      levelMap.set(st.userId, st.finalLevel);
    });
  } else {
    const logs = await prisma.userPointsLog.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: searchStart, lte: searchEnd } },
      _sum: { points: true },
    });
    
    const logMap = new Map(logs.map(l => [l.userId, l._sum.points || 0]));
    users.forEach(u => {
      const raw = Math.max(logMap.get(u.id) || 0, u.points);
      const pts = Math.max(0, raw);
      pointsMap.set(u.id, pts);
      levelMap.set(u.id, calculateSeasonLevel(pts));
    });
  }

  const ranking = users.map(u => {
    const seasonPts = pointsMap.get(u.id) || 0;
    const seasonLvl = levelMap.get(u.id) || 1;
    
    const userRentals = rentals.filter(r => r.userId === u.id);
    const games = Array.from(new Set(userRentals.map(r => r.gameTitleSnapshot || r.game?.title).filter(Boolean)));
    return {
      ...u,
      points: seasonPts,
      level: seasonLvl,
      rentalsCount: userRentals.length,
      gamesRented: games,
    };
  }).sort((a, b) => b.points - a.points);

  return res.json(ranking);
});

seasonRoutes.patch("/:id", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const seasonId = parseQueryString(req.params.id);
  if (!seasonId) return res.status(400).json({ error: "ID inválido." });
  const { nome, dataInicio, dataFim, recompensas } = req.body;

  const data: any = {};
  if (nome) data.name = nome;
  if (dataInicio) data.startDate = getStartOfDay(dataInicio);
  if (dataFim) data.endDate = getEndOfDay(dataFim);
  if (recompensas) data.rewards = recompensas;

  const updated = await prisma.season.update({
    where: { id: seasonId },
    data,
  });

  await generateSeasonSnapshot(updated.id);

  return res.json(updated);
});

seasonRoutes.delete("/:id", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const seasonId = parseQueryString(req.params.id);
  if (!seasonId) return res.status(400).json({ error: "ID inválido." });

  await prisma.season.delete({ where: { id: seasonId } });
  return res.json({ ok: true, message: "Temporada excluída com sucesso." });
});