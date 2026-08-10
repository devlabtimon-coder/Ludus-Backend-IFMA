import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken"; 
import { Resend } from "resend";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { verifySuapCredentials } from "../services/suap.service";

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

const IFMA_DOMAINS = ["@acad.ifma.edu.br", "@ifma.edu.br"];

function gen6() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanDigits(v: any) {
  return v ? String(v).trim().replace(/\D/g, "") : "";
}

function isPendingExpired(createdAt: Date) {
  return Date.now() - createdAt.getTime() > 24 * 60 * 60 * 1000;
}

// 🔥 Funções auxiliares adicionadas para gerar o token e formatar o usuário
function signUserToken(userId: string, role: string) {
  return jwt.sign(
    { role },
    process.env.JWT_SECRET || "secret_fallback",
    {
      subject: userId,
      expiresIn: "7d",
    }
  );
}

function buildUserResponse(user: any) {
  return {
    id: user.id,
    nome: user.name,
    name: user.name,
    email: user.email,
    phone: user.phone,
    cpf: user.cpf || null,
    address: user.address || null,
    role: user.role,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    points: user.points,
    level: user.level,
    authProvider: user.authProvider,
    avatar: user.avatar,
    picture: user.picture,
    registrationStatus: user.registrationStatus,
    rejectReason: user.rejectReason,
    documentFrontImage: user.documentFrontImage,
    documentBackImage: user.documentBackImage,
    addressProof: user.addressProof,
    matricula: user.matricula || null,
    isAcademicVerified: user.isAcademicVerified || false,
  };
}

router.post("/register", async (req, res) => {
 
  const { name, email, matricula, phone, senha, acceptedTerms, acceptedPrivacy, isGoogle } = req.body;

  try {
    const cleanName = (name || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanMatricula = (matricula || "").trim().toUpperCase();
    const cleanPhone = phone ? cleanDigits(phone) : null;

    if (!cleanName) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }

    if (!cleanEmail) {
      return res.status(400).json({ error: "E-mail é obrigatório." });
    }

    const isValidDomain = IFMA_DOMAINS.some(domain => cleanEmail.endsWith(domain));
    if (!isValidDomain) {
      return res.status(400).json({ 
        error: `Apenas e-mails institucionais são aceitos (@acad.ifma.edu.br ou @ifma.edu.br).`,
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

    
    if ((!senha || senha.length < 6) && !isGoogle) {
      return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres." });
    }

    if (!acceptedTerms || !acceptedPrivacy) {
      return res.status(400).json({
        error: "Você precisa aceitar os Termos de Uso e a Política de Privacidade.",
      });
    }

   
    if (isGoogle) {
      if (cleanPhone) {
        const phoneExists = await prisma.user.findFirst({
          where: { phone: cleanPhone, email: { not: cleanEmail } },
        });
        if (phoneExists) {
          return res.status(400).json({ error: "Telefone já cadastrado." });
        }
      }

      let user = await prisma.user.findUnique({ where: { email: cleanEmail } });
      const hash = (senha && senha.length >= 6) ? await bcrypt.hash(senha, 10) : null;

      if (user) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            name: cleanName,
            matricula: cleanMatricula,
            phone: cleanPhone,
            senhaHash: user.senhaHash || hash, 
            emailVerified: true,
            authProvider: "GOOGLE",
            termsAcceptedAt: user.termsAcceptedAt || (acceptedTerms ? new Date() : null),
            privacyAcceptedAt: user.privacyAcceptedAt || (acceptedPrivacy ? new Date() : null),
          }
        });
      } else {
        user = await prisma.user.create({
          data: {
            name: cleanName,
            email: cleanEmail,
            phone: cleanPhone,
            senhaHash: hash,
            matricula: cleanMatricula,
            authProvider: "GOOGLE",
            emailVerified: true, 
            phoneVerified: false,
            termsAcceptedAt: acceptedTerms ? new Date() : null,
            privacyAcceptedAt: acceptedPrivacy ? new Date() : null,
          }
        });
      }

      const token = signUserToken(user.id, user.role);

      return res.status(201).json({
        message: "Cadastro concluído com sucesso via Google!",
        token,
        user: buildUserResponse(user),
      });
    }
   
    await prisma.pendingRegistration.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    
    const emailExists = await prisma.user.findUnique({
      where: { email: cleanEmail },
      select: { id: true },
    });
    if (emailExists) {
      return res.status(400).json({ error: "Este e-mail já está em uso." });
    }

    const matriculaExists = await prisma.user.findUnique({
      where: { matricula: cleanMatricula },
      select: { id: true },
    });
    if (matriculaExists) {
      return res.status(400).json({
        error: "Esta matrícula já está associada a uma conta.",
        code: "MATRICULA_IN_USE",
      });
    }

    if (cleanPhone) {
      const phoneExists = await prisma.user.findUnique({
        where: { phone: cleanPhone },
        select: { id: true },
      });
      if (phoneExists) {
        return res.status(400).json({ error: "Telefone já cadastrado." });
      }
    }
  
    const pendingConflict = await prisma.pendingRegistration.findFirst({
      where: {
        NOT: { email: cleanEmail },
        OR: [
          { matricula: cleanMatricula },
          ...(cleanPhone ? [{ phone: cleanPhone }] : [])
        ]
      }
    });

    if (pendingConflict) {
      return res.status(400).json({ 
        error: "Esta matrícula ou telefone já estão em processo de verificação por outra pessoa. Tente novamente mais tarde." 
      });
    }

    const pendingByEmail = await prisma.pendingRegistration.findUnique({
      where: { email: cleanEmail },
    });

    if (pendingByEmail && !isPendingExpired(pendingByEmail.createdAt)) {

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

    if (pendingByEmail && isPendingExpired(pendingByEmail.createdAt)) {
      await prisma.pendingRegistration.delete({ where: { id: pendingByEmail.id } });
    }

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
    return res.status(400).json({ 
      error: err.message || "Erro interno ao iniciar cadastro. Verifique os dados fornecidos." 
    });
  }
});

router.post("/verify-suap", ensureAuthenticated, async (req, res) => {
  const { suapUsername, suapPassword } = req.body;

  if (!suapUsername || !suapPassword) {
    return res.status(400).json({
      error: "Usuário e senha do SUAP são obrigatórios.",
    });
  }

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

  const updatedUser = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      isAcademicVerified: true,
      academicVerifiedAt: new Date(),
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