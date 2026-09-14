import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";

export const maintenanceRoutes = Router();

maintenanceRoutes.get("/", ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    
   
    const inactiveGames = await prisma.game.findMany({
      where: { isActive: false },
      select: {
        id: true,
        title: true,
        cover: true,
        inactivationReason: true,
      }
    });

    const brokenCopies = await prisma.gameCopy.findMany({
      where: { available: false },
      include: {
        game: { select: { title: true, cover: true } }
      }
    });
    
    const report = [
      ...inactiveGames.map(g => ({
        id: `game_${g.id}`,
        originalId: g.id,
        type: "GAME",
        title: g.title,
        cover: g.cover,
        code: "Sistema",
        reason: g.inactivationReason || "Inativado sem motivo registrado",
        date: new Date(), 
      })),
      ...brokenCopies.map(c => ({
        id: `copy_${c.id}`,
        originalId: c.id,
        gameId: c.gameId,
        type: "COPY",
        title: c.game?.title || "Desconhecido",
        cover: c.game?.cover,
        code: c.code || `Cópia #${c.number}`,
        reason: c.observations || "Indisponível sem motivo registrado",
        date: c.updatedAt,
      }))
    ];
    
    report.sort((a, b) => b.date.getTime() - a.date.getTime());

    return res.json(report);
  } catch (error) {
    console.error("Erro no Dashboard de Manutenção:", error);
    return res.status(500).json({ error: "Erro ao gerar relatório de manutenção" });
  }
});