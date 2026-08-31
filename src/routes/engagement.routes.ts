import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { getLevelName, getLevelsConfig } from "../services/engagement.service";

const engagementRoutes = Router();

engagementRoutes.get("/levels", (req, res) => {
  return res.json(getLevelsConfig());
});

engagementRoutes.get("/leaderboard", ensureAuthenticated, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);

  const users = await prisma.user.findMany({
    where: { role: "USER" },
    orderBy: [{ points: "desc" }, { level: "desc" }, { name: "asc" }],
    take: limit,
    select: {
      id: true,
      name: true,
      points: true,
      level: true,
      avatar: true,
      picture: true,
      clientCategory: true,
    },
  });

  return res.json(
    users.map((u, i) => ({
      rank: i + 1,
      userId: u.id,
      name: u.name,
      points: u.points,
      level: u.level,
      levelName: getLevelName(u.level),
      avatar: u.avatar,
      picture: u.picture,
      category: u.clientCategory,
    }))
  );
});

engagementRoutes.get("/me", ensureAuthenticated, async (req, res) => {
  const me = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      points: true,
      level: true,
      avatar: true,
      picture: true,
      clientCategory: true,
    },
  });

  if (!me) {
    return res.status(404).json({ error: "User not found" });
  }

  const above = await prisma.user.count({
    where: { 
      role: "USER", 
      points: { gt: me.points } 
    },
  });

  const now = new Date();
  const activeSeason = await prisma.season.findFirst({
    where: {
      startDate: { lte: now },
      endDate: { gte: now }
    }
  });

  return res.json({
    userId: me.id,
    name: me.name,
    points: me.points,
    level: me.level,
    levelName: getLevelName(me.level),
    rank: above + 1,
    avatar: me.avatar,
    picture: me.picture,
    category: me.clientCategory,
    seasonName: activeSeason?.name || null,
  });
});

engagementRoutes.get("/active-season", ensureAuthenticated, async (req, res) => {
  try {
    const now = new Date();
    const activeSeason = await prisma.season.findFirst({
      where: {
        startDate: { lte: now },
        endDate: { gte: now }
      },
      select: {
        id: true,
        name: true,
        endDate: true,
        rewards: true
      }
    });

    if (!activeSeason) {
      return res.json({ activeSeason: null });
    }

    return res.json({ activeSeason });
  } catch (err) {
    console.error("Erro ao buscar temporada ativa:", err);
    return res.status(500).json({ error: "Erro interno ao buscar temporada ativa." });
  }
});

export { engagementRoutes };