import { Router } from "express";
import { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";
import { ensureString } from "../utils/params";
import { notifyUser } from "../services/notify.service";

export const adminUserRoutes = Router();

adminUserRoutes.patch("/:id/block", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const id = ensureString(req.params.id); 
  const { isBlocked } = req.body;

  if (!id) return res.status(400).json({ error: "ID do usuário é obrigatório." });
  if (typeof isBlocked !== "boolean") {
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

adminUserRoutes.patch("/:id/verify-academic", ensureAuthenticated, ensureAdmin, async (req, res) => {
  if (process.env.IFMA_MODE !== "true") {
    return res.status(403).json({ error: "Funcionalidade disponível apenas no Modo IFMA." });
  }
  
  const id = ensureString(req.params.id); 
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

adminUserRoutes.patch("/:id/approve-docs", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const id = ensureString(req.params.id);
  if (!id) return res.status(400).json({ error: "ID do usuário é obrigatório." });

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    const isIfmaMode = process.env.IFMA_MODE === "true";

    const updateData: any = {
      registrationStatus: "APPROVED",
      rejectReason: null 
    };

    if (isIfmaMode) {
      updateData.isAcademicVerified = true;
      updateData.academicVerifiedAt = new Date();
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData
    });

    await notifyUser({
      userId: id,
      type: NotificationType.SYSTEM_ANNOUNCEMENT,
      title: "Cadastro Aprovado! 🎉",
      body: "Seus documentos foram validados. Você já pode realizar aluguéis no nosso acervo!",
      channelId: "system",
    });

    return res.json({ message: "Documentos aprovados com sucesso.", user: updatedUser });
  } catch (err) {
    console.error("Erro ao aprovar documentos:", err);
    return res.status(500).json({ error: "Erro interno ao aprovar documentos." });
  }
});

adminUserRoutes.patch("/:id/reject-docs", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const id = ensureString(req.params.id);
  const { reason } = req.body;

  if (!id) return res.status(400).json({ error: "ID do usuário é obrigatório." });
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    return res.status(400).json({ error: "O motivo da rejeição é obrigatório." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    const isIfmaMode = process.env.IFMA_MODE === "true";

    const updateData: any = {
      registrationStatus: "REJECTED",
      rejectReason: reason.trim()
    };

    if (isIfmaMode) {
      updateData.isAcademicVerified = false;
      updateData.academicVerifiedAt = null;
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData
    });

    await notifyUser({
      userId: id,
      type: NotificationType.VERIFY_REQUIRED,
      title: "Atenção ao seu cadastro",
      body: `Houve um problema com seus documentos: ${reason.trim()}`,
      channelId: "system",
    });

    return res.json({ message: "Documentos rejeitados com sucesso.", user: updatedUser });
  } catch (err) {
    console.error("Erro ao rejeitar documentos:", err);
    return res.status(500).json({ error: "Erro interno ao rejeitar documentos." });
  }
});

adminUserRoutes.get("/", ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isBlocked: true,
        createdAt: true,
        selfieWithId: true,
        enrollmentProof: true,
        cpf: true,
        address: true,
        avatar: true,  
        picture: true, 
        registrationStatus: true,
        documentFile: true, 
        addressProof: true,
        rejectReason: true,
        points: true,
        totalRentalsCount: true,
        clientCategory: true,
      }
    });

    return res.json(users);
  } catch (err) {
    console.error("Erro ao listar usuários:", err);
    return res.status(500).json({ error: "Erro ao listar usuários." });
  }
});

adminUserRoutes.post("/:id/request-doc", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const id = ensureString(req.params.id);
  const { documentName } = req.body;

  if (!id || !documentName) {
    return res.status(400).json({ error: "ID e Nome do Documento são obrigatórios." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    await notifyUser({
      userId: id,
      type: NotificationType.VERIFY_REQUIRED,
      title: "Documento Pendente 📄",
      body: `Precisamos que você envie a foto de: ${documentName} para liberar seu cadastro.`,
      channelId: "system",
      data: { route: "/profile/documents" }
    });

    return res.json({ message: "Notificação enviada com sucesso!" });
  } catch (err) {
    console.error("Erro ao solicitar documento:", err);
    return res.status(500).json({ error: "Erro ao notificar o usuário." });
  }
});

adminUserRoutes.post("/:id/generate-coupons", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const id = ensureString(req.params.id);
  if (!id) return res.status(400).json({ error: "ID do usuário é obrigatório." });

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, level: true }
    });

    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    const now = new Date();
    const activeSeason = await prisma.season.findFirst({
      where: {
        startDate: { lte: now },
        endDate: { gte: now }
      }
    });

    if (!activeSeason) {
      return res.status(400).json({ error: "Nenhuma temporada ativa para gerar recompensas." });
    }

    const rewardLevels = [2, 3, 4, 5];
    const reachedLevels = rewardLevels.filter((lvl) => lvl <= user.level);

    if (reachedLevels.length === 0) {
      return res.status(400).json({ error: "O usuário ainda não atingiu níveis com recompensa." });
    }

    const existingCoupons = await prisma.coupon.findMany({
      where: {
        userId: id,
        seasonId: activeSeason.id,
        type: { startsWith: "REWARD_LEVEL_" }
      },
      select: { type: true }
    });

    const alreadyGeneratedLevels = existingCoupons.map((c) =>
      parseInt(c.type.replace("REWARD_LEVEL_", ""), 10)
    );

    const pendingLevels = reachedLevels.filter(
      (lvl) => !alreadyGeneratedLevels.includes(lvl)
    );

    if (pendingLevels.length === 0) {
      return res.status(400).json({ error: "Todos os cupons pendentes já foram gerados para este usuário." });
    }

    const seasonRewards = (activeSeason.rewards as any) || {};
    const newCoupons = [];

    for (const lvl of pendingLevels) {
      const rewardConfig = seasonRewards[`nivel${lvl}`]?.cuponsGerados?.[0] || {};
      const valorDesconto = rewardConfig.valor || 100;
      const descricao = rewardConfig.descricao || `Recompensa do Nível ${lvl}`;

      newCoupons.push({
        userId: id,
        seasonId: activeSeason.id,
        code: `NVL${lvl}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        type: `REWARD_LEVEL_${lvl}`,
        value: valorDesconto,
        description: descricao,
        expiresAt: activeSeason.endDate,
        isUsed: false,
      });
    }

    await prisma.coupon.createMany({
      data: newCoupons
    });

    return res.json({
      message: `${newCoupons.length} cupom(ns) gerado(s) com sucesso.`,
      levelsGenerated: pendingLevels
    });
  } catch (err) {
    console.error("Erro ao gerar cupons:", err);
    return res.status(500).json({ error: "Erro ao gerar cupons." });
  }
});