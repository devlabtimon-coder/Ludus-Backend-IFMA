import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";

export const adminLogRoutes = Router();

adminLogRoutes.get("/", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const limit = Number(req.query.limit) || 50;

  try {
    const logs = await prisma.adminLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        admin: {
     
          select: { name: true, email: true, avatar: true, picture: true }
        }
      }
    });

    return res.json(logs);
  } catch (err) {
    console.error("Erro ao buscar logs de auditoria:", err);
    return res.status(500).json({ error: "Erro interno ao listar logs." });
  }
});