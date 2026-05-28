import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";
import { ensureString } from "../utils/params"; // Importe o helper

export const adminUserRoutes = Router();

// Bloquear ou Desbloquear usuário
adminUserRoutes.patch("/:id/block", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const id = ensureString(req.params.id); // Normalizado com o helper
  const { isBlocked } = req.body;

  if (!id) return res.status(400).json({ error: "ID do usuário é obrigatório." });
  if (typeof isBlocked !== 'boolean') {
    return res.status(400).json({ error: "O campo isBlocked deve ser um booleano." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    await prisma.user.update({
      where: { id },
      data: { isBlocked }
    });
    
    return res.json({ 
      message: isBlocked ? "Usuário bloqueado com sucesso." : "Usuário desbloqueado com sucesso." 
    });
  } catch (err) {
    console.error("Erro ao atualizar status do usuário:", err);
    return res.status(500).json({ error: "Erro ao atualizar status do usuário." });
  }
});

// Rota para aprovação acadêmica
adminUserRoutes.patch("/:id/verify-academic", ensureAuthenticated, ensureAdmin, async (req, res) => {
  if (process.env.IFMA_MODE !== "true") {
    return res.status(403).json({ error: "Funcionalidade disponível apenas no Modo IFMA." });
  }
  
  const id = ensureString(req.params.id); // Normalizado com o helper
  if (!id) return res.status(400).json({ error: "ID do usuário é obrigatório." });

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    await prisma.user.update({
      where: { id },
      data: { isAcademicVerified: true, academicVerifiedAt: new Date() }
    });
    return res.json({ message: "Vínculo acadêmico aprovado manualmente." });
  } catch (err) {
    console.error("Erro ao aprovar vínculo:", err);
    return res.status(500).json({ error: "Erro ao aprovar vínculo." });
  }
});