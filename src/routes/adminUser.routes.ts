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
        createdAt: 'desc',
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
        documentFrontImage: true,
        documentBackImage: true,
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