/**
 * ifma.routes.ts
 *
 * Rotas exclusivas da versão IFMA do Ludus:
 *   POST /auth/ifma/register     — Cadastro com matrícula + email @acad.ifma.edu.br
 *   POST /auth/ifma/verify-suap  — Verifica vínculo acadêmico via SUAP
 *   GET  /auth/ifma/status       — Retorna status de verificação do usuário logado
 *
 * Essas rotas são registradas APENAS quando IFMA_MODE=true no .env.
 */

import { Router } from "express";
import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { verifySuapCredentials } from "../services/suap.service";

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

// Domínio institucional aceito
const IFMA_EMAIL_DOMAIN = "@acad.ifma.edu.br";

function gen6() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanDigits(v: any) {
  return v ? String(v).trim().replace(/\D/g, "") : "";
}

function isPendingExpired(createdAt: Date) {
  return Date.now() - createdAt.getTime() > 24 * 60 * 60 * 1000;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/ifma/register
//
// Diferenças em relação ao register padrão:
//  - Exige email @acad.ifma.edu.br
//  - Exige matrícula (será a mesma usada no SUAP)
//  - Telefone é opcional (alunos podem não ter)
//  - Salva matricula no PendingRegistration
// ─────────────────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  const { name, email, matricula, phone, senha, acceptedTerms, acceptedPrivacy } =
    req.body;

  try {
    const cleanName = (name || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanMatricula = (matricula || "").trim();
    const cleanPhone = phone ? cleanDigits(phone) : null;

    // ── Validações ────────────────────────────────────────────────────────────
    if (!cleanName) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }

    if (!cleanEmail) {
      return res.status(400).json({ error: "E-mail é obrigatório." });
    }

    if (!cleanEmail.endsWith(IFMA_EMAIL_DOMAIN)) {
      return res.status(400).json({ 
        error: `Apenas e-mails institucionais são aceitos (${IFMA_EMAIL_DOMAIN}).`,
        code: "INVALID_INSTITUTIONAL_EMAIL",
      });
    }

    if (!cleanMatricula) {
      return res.status(400).json({ error: "Matrícula é obrigatória." });
    }

  if (!/^\d{5}[A-Z0-9.]+\.TMN\d+$/.test(cleanMatricula)) {
  return res.status(400).json({
    error: "Matrícula inválida. Use o padrão institucional do Campus Timon (Ex: 20241INF.TMN0025).",
    code: "INVALID_MATRICULA",
  });
}

    if (!senha || senha.length < 6) {
      return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres." });
    }

    if (!acceptedTerms || !acceptedPrivacy) {
      return res.status(400).json({
        error: "Você precisa aceitar os Termos de Uso e a Política de Privacidade.",
      });
    }

    // ── Limpa pendências antigas ──────────────────────────────────────────────
    await prisma.pendingRegistration.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });

    // ── Checa duplicatas ──────────────────────────────────────────────────────
    const emailExists = await prisma.user.findUnique({
      where: { email: cleanEmail },
      select: { id: true },
    });
    if (emailExists) {
      return res.status(409).json({ error: "Este e-mail já está em uso." });
    }

    const matriculaExists = await prisma.user.findFirst({
      where: { matricula: cleanMatricula },
      select: { id: true },
    });
    if (matriculaExists) {
      return res.status(409).json({
        error: "Esta matrícula já está associada a uma conta.",
        code: "MATRICULA_IN_USE",
      });
    }

    // ── Pendência já existe? ──────────────────────────────────────────────────
    const pendingByEmail = await prisma.pendingRegistration.findUnique({
      where: { email: cleanEmail },
    });

    if (pendingByEmail && !isPendingExpired(pendingByEmail.createdAt)) {
      // Rate-limit de reenvio
      if (pendingByEmail.lastEmailSentAt) {
        const elapsed = Date.now() - pendingByEmail.lastEmailSentAt.getTime();
        const waitMs = 30_000 - elapsed;
        if (waitMs > 0) {
          return res.status(429).json({
            error: `Aguarde ${Math.ceil(waitMs / 1000)}s antes de tentar novamente.`,
            code: "WAIT_BEFORE_RESEND",
            retryAfter: Math.ceil(waitMs / 1000),
          });
        }
      }

      // Atualiza pendência existente com novo código
      const emailCode = gen6();
      const hash = await bcrypt.hash(senha, 10);

      await prisma.pendingRegistration.update({
        where: { id: pendingByEmail.id },
        data: {
          name: cleanName,
          matricula: cleanMatricula,
          phone: cleanPhone,
          senhaHash: hash,
          acceptedTerms,
          acceptedPrivacy,
          emailVerificationCode: emailCode,
          emailCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          lastEmailSentAt: new Date(),
          emailVerified: false,
        },
      });

      await sendVerificationEmail(cleanEmail, cleanName, emailCode);

      return res.status(200).json({
        message: "Cadastro pendente atualizado. Enviamos um novo código por e-mail.",
      });
    }

    // ── Cria novo pendingRegistration ─────────────────────────────────────────
    const hash = await bcrypt.hash(senha, 10);
    const emailCode = gen6();

    await prisma.pendingRegistration.create({
      data: {
        name: cleanName,
        email: cleanEmail,
        matricula: cleanMatricula,
        phone: cleanPhone,
        senhaHash: hash,
        acceptedTerms,
        acceptedPrivacy,
        emailVerificationCode: emailCode,
        emailCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        lastEmailSentAt: new Date(),
      },
    });

    await sendVerificationEmail(cleanEmail, cleanName, emailCode);

    return res.status(201).json({
      message: "Cadastro iniciado. Verifique seu e-mail institucional.",
    });
  } catch (err: any) {
    console.error("ERRO /ifma/register:", err);
    return res.status(500).json({ error: "Erro ao iniciar cadastro." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/ifma/verify-suap
//
// Chamado APÓS o login normal do Ludus (usuário já autenticado).
// Recebe as credenciais do SUAP, verifica e marca isAcademicVerified=true.
// A senha do SUAP NUNCA é salva.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/verify-suap", ensureAuthenticated, async (req, res) => {
  const { suapUsername, suapPassword } = req.body;

  if (!suapUsername || !suapPassword) {
    return res.status(400).json({
      error: "Usuário e senha do SUAP são obrigatórios.",
    });
  }

  // Já está verificado?
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, isAcademicVerified: true, matricula: true },
  });

  if (!user) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }

  if (user.isAcademicVerified) {
    return res.status(200).json({
      message: "Vínculo acadêmico já verificado.",
      isAcademicVerified: true,
    });
  }

  // ── Scraping do SUAP ──────────────────────────────────────────────────────
  const result = await verifySuapCredentials(suapUsername, suapPassword);

  if (!result.ok) {
    if (result.reason === "INVALID_CREDENTIALS") {
      return res.status(401).json({
        error: "Usuário ou senha do SUAP incorretos. Tente novamente.",
        code: "SUAP_INVALID_CREDENTIALS",
      });
    }

    if (result.reason === "TIMEOUT") {
      return res.status(504).json({
        error: "O SUAP não respondeu a tempo. Tente novamente em instantes.",
        code: "SUAP_TIMEOUT",
      });
    }

    return res.status(503).json({
      error: "Não foi possível conectar ao SUAP. Tente novamente mais tarde.",
      code: "SUAP_UNAVAILABLE",
    });
  }

  // ── Sucesso — marca usuário como verificado ───────────────────────────────
  const updatedUser = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      isAcademicVerified: true,
      academicVerifiedAt: new Date(),
      // Se a matrícula ainda não foi salva (ex: cadastro via Google), salva agora
      matricula: user.matricula ?? result.matricula,
    },
    select: {
      id: true,
      name: true,
      email: true,
      isAcademicVerified: true,
      academicVerifiedAt: true,
      matricula: true,
    },
  });

  return res.json({
    message: "Vínculo acadêmico verificado com sucesso! ✅",
    isAcademicVerified: true,
    academicVerifiedAt: updatedUser.academicVerifiedAt,
    matricula: updatedUser.matricula,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/ifma/status
//
// Retorna o status de verificação acadêmica do usuário logado.
// O app consulta essa rota após login para saber se deve exibir a tela do SUAP.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/status", ensureAuthenticated, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        isAcademicVerified: true,
        academicVerifiedAt: true,
        matricula: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    return res.json({
      isAcademicVerified: user.isAcademicVerified,
      academicVerifiedAt: user.academicVerifiedAt,
      matricula: user.matricula,
    });
  } catch (err) {
    console.error("Erro em /ifma/status:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function sendVerificationEmail(
  to: string,
  name: string,
  code: string
): Promise<void> {
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM!,
      to: [to],
      subject: "Código de verificação — Ludus IFMA",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <div style="background: #04096E; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: #FBBC04; margin: 0; font-size: 28px;">LUDUS</h1>
            <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px;">
              Sistema de empréstimos — IFMA
            </p>
          </div>
          <div style="background: #f9f9f9; padding: 28px; border-radius: 0 0 12px 12px;">
            <p style="color: #333; font-size: 15px;">Olá, <strong>${name}</strong>!</p>
            <p style="color: #555; font-size: 14px;">
              Use o código abaixo para confirmar seu e-mail institucional:
            </p>
            <div style="
              background: #fff;
              border: 2px dashed #04096E;
              border-radius: 12px;
              padding: 20px;
              text-align: center;
              margin: 20px 0;
            ">
              <span style="
                font-size: 36px;
                font-weight: 700;
                letter-spacing: 12px;
                color: #04096E;
              ">${code}</span>
            </div>
            <p style="color: #888; font-size: 12px; text-align: center;">
              Este código expira em <strong>10 minutos</strong>.<br>
              Se não foi você, ignore este e-mail.
            </p>
          </div>
        </div>
      `,
    });
  } catch (e) {
    console.error("[IFMA] Falha ao enviar e-mail de verificação:", e);
  }
}

export default router;