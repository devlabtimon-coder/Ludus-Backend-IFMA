import { Router } from "express";
import { NotificationType } from "@prisma/client"; // Adicionado para as notificações
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";
import { ensureString } from "../utils/params";
import { notifyUser } from "../services/notify.service"; // Importando serviço de notificação[cite: 1]

export const adminUserRoutes = Router();

// Bloquear ou Desbloquear usuário
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

// ==========================================
// MODO IFMA: Aprovação Acadêmica (SUAP)
// ==========================================
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

// ==========================================
// MODO PADRÃO (SaaS): Aprovação de Documentos
// ==========================================

// Aprovar Documentos
adminUserRoutes.patch("/:id/approve-docs", ensureAuthenticated, ensureAdmin, async (req, res) => {
  if (process.env.IFMA_MODE === "true") {
    return res.status(403).json({ error: "No modo IFMA, a verificação é automática pelo SUAP." });
  }

  const id = ensureString(req.params.id);
  if (!id) return res.status(400).json({ error: "ID do usuário é obrigatório." });

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        registrationStatus: "APPROVED",
        rejectReason: null // Limpa caso houvesse rejeição anterior
      }
    });

    // Avisa o cliente no app que ele já pode alugar jogos!
    await notifyUser({
      userId: id,
      type: NotificationType.SYSTEM_ANNOUNCEMENT, //[cite: 2]
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

// Rejeitar Documentos
adminUserRoutes.patch("/:id/reject-docs", ensureAuthenticated, ensureAdmin, async (req, res) => {
  if (process.env.IFMA_MODE === "true") {
    return res.status(403).json({ error: "No modo IFMA, a verificação é automática pelo SUAP." });
  }

  const id = ensureString(req.params.id);
  const { reason } = req.body;

  if (!id) return res.status(400).json({ error: "ID do usuário é obrigatório." });
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    return res.status(400).json({ error: "O motivo da rejeição é obrigatório." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        registrationStatus: "REJECTED",
        rejectReason: reason.trim()
      }
    });

    // Manda push de alerta pro cliente corrigir
    await notifyUser({
      userId: id,
      type: NotificationType.VERIFY_REQUIRED, //[cite: 2]
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

// ==========================================
// LISTAR TODOS OS USUÁRIOS (COM DOCUMENTOS)
// ==========================================
adminUserRoutes.get("/", ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: {
        createdAt: 'desc', // Mostra os cadastros mais recentes primeiro
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isBlocked: true,
        createdAt: true,
        
        // 👇 NOVOS CAMPOS ADICIONADOS AQUI 👇
        cpf: true,
        address: true,
        avatar: true,  // Adicionado para carregar a foto de perfil
        picture: true, // Caso utilizes login do Google, a foto pode vir aqui
        
        // 👇 ESSES SÃO OS CAMPOS QUE FAZEM O PAINEL FUNCIONAR 👇
        registrationStatus: true,
        documentFrontImage: true,
        documentBackImage: true,
        addressProof: true,
        rejectReason: true,
      }
    });

    return res.json(users);
  } catch (err) {
    console.error("Erro ao listar usuários:", err);
    return res.status(500).json({ error: "Erro ao listar usuários." });
  }
});

// Solicitar reenvio de um documento específico
adminUserRoutes.post("/:id/request-doc", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const id = ensureString(req.params.id);
  const { documentName } = req.body;

  if (!id || !documentName) {
    return res.status(400).json({ error: "ID e Nome do Documento são obrigatórios." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    // Dispara a notificação pro celular do cliente
    await notifyUser({
      userId: id,
      type: NotificationType.VERIFY_REQUIRED,
      title: "Documento Pendente 📄",
      body: `Precisamos que você envie a foto de: ${documentName} para liberar seu cadastro.`,
      channelId: "system",
      data: { route: "/profile/documents" } // Manda o cliente direto pra tela de documentos
    });

    return res.json({ message: "Notificação enviada com sucesso!" });
  } catch (err) {
    console.error("Erro ao solicitar documento:", err);
    return res.status(500).json({ error: "Erro ao notificar o usuário." });
  }
});