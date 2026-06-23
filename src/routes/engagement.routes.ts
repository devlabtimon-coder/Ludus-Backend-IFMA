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
    // 👇 Filtra para não mostrar os administradores do sistema no ranking
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
    },
  });

  if (!me) {
    return res.status(404).json({ error: "User not found" });
  }

  // 👇 Conta apenas os alunos que estão acima
  const above = await prisma.user.count({
    where: { 
      role: "USER", 
      points: { gt: me.points } 
    },
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
  });
});

export { engagementRoutes };