import jwt from "jsonwebtoken";
import { Router } from "express";
import bcrypt from "bcryptjs";
import twilio from "twilio";
import { Resend } from "resend";

import { prisma } from "../lib/prisma";
import { login, loginWithGoogle } from "../services/auth.service";

const router = Router();

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const resend = new Resend(process.env.RESEND_API_KEY);

function gen6() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanDigits(v: any) {
  return v ? String(v).trim().replace(/\D/g, "") : "";
}

function isPendingExpired(createdAt: Date) {
  const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
  return Date.now() - createdAt.getTime() > PENDING_TTL_MS;
}

function buildUserResponse(user: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  cpf: string | null;
  address: string | null;
  role: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  points: number;
  level: number;
  authProvider: string;
  avatar: string | null;
  picture: string | null;
  
  // 👇 ADICIONE ESTES CAMPOS NA TIPAGEM 👇
  registrationStatus?: string | null;
  rejectReason?: string | null;
  documentFrontImage?: string | null;
  documentBackImage?: string | null;
  addressProof?: string | null;
}) {
  return {
    id: user.id,
    nome: user.name,
    name: user.name,
    email: user.email,
    phone: user.phone,
    cpf: user.cpf,
    address: user.address,
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
  };
}

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

router.post("/login", async (req, res) => {
  const { email, senha } = req.body;

  try {
    const data = await login(email, senha);
    return res.json(data);
  } catch (error: any) {
    return res.status(401).json({ error: error.message });
  }
});

router.post("/google", async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: "idToken é obrigatório" });
  }

  try {
    const result = await loginWithGoogle(idToken);
    return res.json(result);
  } catch (err: any) {
    console.error("ERRO /auth/google:", err);

    const prismaCode = err?.code;
    const msg = err?.message || "Falha ao autenticar com Google";

    const isAuthError =
      msg.toLowerCase().includes("token") ||
      msg.toLowerCase().includes("jwt") ||
      msg.toLowerCase().includes("audience") ||
      msg.toLowerCase().includes("invalid");

    if (isAuthError) {
      return res.status(401).json({ error: msg });
    }

    return res.status(500).json({
      error: msg,
      prismaCode,
    });
  }
});

router.post("/register", async (req, res) => {
  const { name, email, phone, senha, acceptedTerms, acceptedPrivacy, cpf, address } = req.body;

  try {
    const cleanName = (name || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPhone = phone ? cleanDigits(phone) : null;
    const cleanCpf = cleanDigits(cpf);
    const cleanAddress = (address || "").trim();

    if (!cleanAddress) { 
      return res.status(400).json({ error: "Endereço é obrigatório." });
    }

    if(!cleanCpf) {
      return res.status(400).json({ error: "Cpf é obrigatório." });
    };

    if (!cleanName) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }

    if (!cleanEmail) {
      return res.status(400).json({ error: "E-mail é obrigatório." });
    }

    if (!senha) {
      return res.status(400).json({ error: "Senha é obrigatória." });
    }

    if (!acceptedTerms || !acceptedPrivacy) {
      return res.status(400).json({
        error: "Você precisa aceitar os Termos de Uso e a Política de Privacidade.",
      });
    }

    // limpa pendências antigas
    await prisma.pendingRegistration.deleteMany({
      where: {
        createdAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    // usuário real já existe?
    const emailExists = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (emailExists) {
      return res.status(400).json({ error: "Este e-mail já está em uso." });
    }

    if (cleanPhone) {
      const phoneExists = await prisma.user.findUnique({
        where: { phone: cleanPhone },
      });

      if (phoneExists) {
        return res.status(400).json({ error: "Telefone já cadastrado." });
      }
    }

    const pendingExists = await prisma.pendingRegistration.findUnique({
      where: { email: cleanEmail },
    });

    if (pendingExists) {
      if (isPendingExpired(pendingExists.createdAt)) {
        await prisma.pendingRegistration.delete({
          where: { id: pendingExists.id },
        });
      } else {
        if (pendingExists.lastEmailSentAt) {
          const elapsed = Date.now() - pendingExists.lastEmailSentAt.getTime();
          const waitMs = 30_000 - elapsed;

          if (waitMs > 0) {
            const retryAfterSec = Math.ceil(waitMs / 1000);
            return res.status(429).json({
              error: `Aguarde ${retryAfterSec} segundos antes de tentar novamente.`,
              code: "WAIT_BEFORE_RESEND",
              retryAfter: retryAfterSec,
            });
          }
        }

        const hash = await bcrypt.hash(senha, 10);
        const emailCode = gen6();
        const emailExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await prisma.pendingRegistration.update({
          where: { id: pendingExists.id },
          data: {
            name: cleanName,
            phone: cleanPhone,
            senhaHash: hash,
            acceptedTerms,
            acceptedPrivacy,
            cpf: cleanCpf,        // <--- ATUALIZA CPF AQUI
            address: cleanAddress,// <--- ATUALIZA ENDEREÇO AQUI
            emailVerificationCode: emailCode,
            emailCodeExpiresAt: emailExpiresAt,
            lastEmailSentAt: new Date(),
            emailVerified: false,
            phoneVerified: false,
          },
        });

        try {
          await resend.emails.send({
            from: process.env.RESEND_FROM!,
            to: [cleanEmail],
            subject: "Seu novo código de verificação - Ludus",
            html: `
              <div style="font-family: Arial, sans-serif;">
                <h2>Verificação de e-mail</h2>
                <p>Seu novo código é:</p>
                <div style="font-size: 28px; letter-spacing: 6px; font-weight: 700;">
                  ${emailCode}
                </div>
                <p>Esse código expira em 10 minutos.</p>
              </div>
            `,
          });
        } catch (e) {
          console.log("Falha ao enviar e-mail (Resend):", e);
        }

        return res.status(200).json({
          message: "Cadastro pendente atualizado. Enviamos um novo código por e-mail.",
        });
      }
    }

    const hash = await bcrypt.hash(senha, 10);
    const emailCode = gen6();
    const emailExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.pendingRegistration.create({
      data: {
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        senhaHash: hash,
        acceptedTerms,
        acceptedPrivacy,
        cpf: cleanCpf,     // <--- SALVA AQUI
        address: cleanAddress,
        emailVerificationCode: emailCode,
        emailCodeExpiresAt: emailExpiresAt,
        lastEmailSentAt: new Date(),
      },
    });

    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM!,
        to: [cleanEmail],
        subject: "Código de verificação - Ludus",
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>Verificação de e-mail</h2>
            <p>Seu código é:</p>
            <div style="font-size: 28px; letter-spacing: 6px; font-weight: 700;">
              ${emailCode}
            </div>
            <p>Esse código expira em 10 minutos.</p>
          </div>
        `,
      });
    } catch (e) {
      console.log("Falha ao enviar e-mail (Resend):", e);
    }

    return res.status(201).json({
      message: "Cadastro iniciado. Verifique seu e-mail.",
    });
  } catch (err) {
    console.log("ERRO REGISTER:", err);
    return res.status(400).json({ error: "Erro ao iniciar cadastro" });
  }
});

router.post("/verify-email", async (req, res) => {
  const { email, code } = req.body;

  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanCode = cleanDigits(code);

  if (!cleanEmail) {
    return res.status(400).json({ error: "E-mail é obrigatório." });
  }

  if (!cleanCode || cleanCode.length !== 6) {
    return res.status(400).json({ error: "Código inválido." });
  }

  const pending = await prisma.pendingRegistration.findFirst({
    where: {
      email: cleanEmail,
      emailVerificationCode: cleanCode,
    },
  });

  if (!pending) {
    return res.status(400).json({ error: "Código inválido." });
  }

  if (isPendingExpired(pending.createdAt)) {
    await prisma.pendingRegistration.delete({
      where: { id: pending.id },
    });

    return res.status(400).json({
      error: "Esse cadastro expirou. Faça o cadastro novamente.",
      code: "PENDING_REGISTRATION_EXPIRED",
    });
  }

  if (
    pending.emailCodeExpiresAt &&
    pending.emailCodeExpiresAt.getTime() < Date.now()
  ) {
    return res.status(400).json({ error: "Código expirado." });
  }

  const alreadyExists = await prisma.user.findUnique({
    where: { email: pending.email },
  });

  if (alreadyExists) {
    await prisma.pendingRegistration.delete({
      where: { id: pending.id },
    });

    return res.status(400).json({
      error: "Conta já foi criada para este e-mail.",
    });
  }

  const user = await prisma.user.create({
    data: {
      name: pending.name,
      email: pending.email,
      phone: pending.phone,
      senhaHash: pending.senhaHash,
      emailVerified: true,
      phoneVerified: false,
      cpf: pending.cpf!,           // <--- TRANSFERE O CPF
      address: pending.address!,   // <--- TRANSFERE O ENDEREÇO
      termsAcceptedAt: pending.acceptedTerms ? new Date() : null,
      privacyAcceptedAt: pending.acceptedPrivacy ? new Date() : null,
    },
  });

  await prisma.pendingRegistration.delete({
    where: { id: pending.id },
  });

  const token = signUserToken(user.id, user.role);

  return res.json({
    message: "Conta criada com sucesso!",
    token,
    user: buildUserResponse(user),
  });
});

router.post("/resend-email-code", async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail) {
    return res.status(400).json({ error: "E-mail é obrigatório." });
  }

  const pending = await prisma.pendingRegistration.findUnique({
    where: { email: cleanEmail },
  });

  if (!pending) {
    return res.status(404).json({ error: "Cadastro não encontrado." });
  }

  if (isPendingExpired(pending.createdAt)) {
    await prisma.pendingRegistration.delete({
      where: { id: pending.id },
    });

    return res.status(400).json({
      error: "Esse cadastro expirou. Faça o cadastro novamente.",
      code: "PENDING_REGISTRATION_EXPIRED",
    });
  }

  if (pending.lastEmailSentAt) {
    const elapsed = Date.now() - pending.lastEmailSentAt.getTime();
    const waitMs = 30_000 - elapsed;

    if (waitMs > 0) {
      const retryAfterSec = Math.ceil(waitMs / 1000);
      return res.status(429).json({
        error: `Aguarde ${retryAfterSec} segundos antes de reenviar.`,
        code: "WAIT_BEFORE_RESEND",
        retryAfter: retryAfterSec,
      });
    }
  }

  const emailCode = gen6();

  await prisma.pendingRegistration.update({
    where: { id: pending.id },
    data: {
      emailVerificationCode: emailCode,
      emailCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      lastEmailSentAt: new Date(),
    },
  });

  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM!,
      to: [cleanEmail],
      subject: "Novo código de verificação - Ludus",
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Novo código</h2>
          <div style="font-size: 28px; letter-spacing: 6px; font-weight: 700;">
            ${emailCode}
          </div>
          <p>Esse código expira em 10 minutos.</p>
        </div>
      `,
    });
  } catch (e) {
    console.log("Falha ao enviar e-mail (Resend):", e);
  }

  return res.json({ message: "Novo código enviado por e-mail!" });
});

router.post("/verify-phone", async (req, res) => {
  const { phone, code } = req.body;

  const cleanPhone = cleanDigits(phone);
  const cleanCode = cleanDigits(code);

  if (!cleanPhone) {
    return res.status(400).json({ error: "Telefone é obrigatório." });
  }

  if (!cleanCode || cleanCode.length !== 6) {
    return res.status(400).json({ error: "Código inválido." });
  }


  const pending = await prisma.pendingRegistration.findFirst({
    where: {
      phone: cleanPhone,
      phoneVerificationCode: cleanCode,
    },
  });

  if (pending) {
    if (
      pending.phoneCodeExpiresAt &&
      pending.phoneCodeExpiresAt.getTime() < Date.now()
    ) {
      return res.status(400).json({ error: "Código expirado." });
    }

    const updatedPending = await prisma.pendingRegistration.update({
      where: { id: pending.id },
      data: {
        phoneVerified: true,
        phoneVerificationCode: null,
        phoneCodeExpiresAt: null,
      },
    });

    if (updatedPending.emailVerified) {
      const createdUser = await prisma.user.create({
        data: {
          name: updatedPending.name,
          email: updatedPending.email,
          phone: updatedPending.phone,
          senhaHash: updatedPending.senhaHash,
          cpf: updatedPending.cpf!,           // <--- ADICIONADO
          address: updatedPending.address!,   // <--- ADICIONADO
          emailVerified: true,
          phoneVerified: true,
        },
      });

      await prisma.pendingRegistration.delete({
        where: { id: updatedPending.id },
      });

      const token = signUserToken(createdUser.id, createdUser.role);

      return res.json({
        message: "Telefone verificado com sucesso!",
        token,
        user: buildUserResponse(createdUser),
      });
    }


    return res.json({
      message: "Telefone verificado com sucesso!",
      pending: true,
      emailVerified: updatedPending.emailVerified,
      phoneVerified: true,
    });
  }

  
  const user = await prisma.user.findFirst({
    where: {
      phone: cleanPhone,
      verificationCode: cleanCode,
    },
  });

  if (!user) {
    return res.status(400).json({ error: "Código inválido ou expirado." });
  }

  if (user.codeExpiresAt && user.codeExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ error: "Código expirado." });
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      phoneVerified: true,
      verificationCode: null,
      codeExpiresAt: null,
    },
  });

  const token = signUserToken(updatedUser.id, updatedUser.role);

  return res.json({
    message: "Telefone verificado com sucesso!",
    token,
    user: buildUserResponse(updatedUser),
  });
});

router.post("/resend-code", async (req, res) => {
  const { phone } = req.body;
  const cleanPhone = cleanDigits(phone);

  if (!cleanPhone) {
    return res.status(400).json({ error: "Telefone é obrigatório." });
  }

  const pending = await prisma.pendingRegistration.findUnique({
    where: { phone: cleanPhone },
  });

  if (pending) {
    if (pending.lastPhoneSentAt) {
      const elapsed = Date.now() - pending.lastPhoneSentAt.getTime();
      const waitMs = 30_000 - elapsed;

      if (waitMs > 0) {
        const retryAfterSec = Math.ceil(waitMs / 1000);
        return res.status(429).json({
          error: `Aguarde ${retryAfterSec} segundos antes de reenviar.`,
          code: "WAIT_BEFORE_RESEND",
          retryAfter: retryAfterSec,
        });
      }
    }

    const newCode = gen6();
    const now = new Date();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.pendingRegistration.update({
      where: { id: pending.id },
      data: {
        phoneVerificationCode: newCode,
        phoneCodeExpiresAt: expiresAt,
        lastPhoneSentAt: now,
      },
    });

    try {
      await client.messages.create({
        body: `Seu código de verificação Ludus é: ${newCode}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: `+55${cleanPhone}`,
      });
    } catch (e) {
      return res.status(400).json({
        error: "SMS indisponível no momento. Use verificação por e-mail.",
        code: "SMS_UNAVAILABLE",
      });
    }

    return res.json({ message: "Novo código enviado por SMS!" });
  }

  const user = await prisma.user.findUnique({
    where: { phone: cleanPhone },
  });

  if (!user) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }

  if (user.lastCodeSentAt) {
    const elapsed = Date.now() - user.lastCodeSentAt.getTime();
    const waitMs = 30_000 - elapsed;

    if (waitMs > 0) {
      const retryAfterSec = Math.ceil(waitMs / 1000);
      return res.status(429).json({
        error: `Aguarde ${retryAfterSec} segundos antes de reenviar.`,
        code: "WAIT_BEFORE_RESEND",
        retryAfter: retryAfterSec,
      });
    }
  }

  const newCode = gen6();
  const now = new Date();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      verificationCode: newCode,
      codeExpiresAt: expiresAt,
      lastCodeSentAt: now,
    },
  });

  try {
    await client.messages.create({
      body: `Seu código de verificação Ludus é: ${newCode}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: `+55${cleanPhone}`,
    });
  } catch (e) {
    return res.status(400).json({
      error: "SMS indisponível no momento. Use verificação por e-mail.",
      code: "SMS_UNAVAILABLE",
    });
  }

  return res.json({ message: "Novo código enviado por SMS!" });
});


router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail) {
    return res.status(400).json({ error: "E-mail é obrigatório." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

  
    if (!user) {
      return res.status(200).json({
        message: "Se este e-mail estiver cadastrado, você receberá um código.",
      });
    }

 
    if (user.lastEmailSentAt) {
      const elapsed = Date.now() - user.lastEmailSentAt.getTime();
      const waitMs = 30_000 - elapsed;

      if (waitMs > 0) {
        const retryAfterSec = Math.ceil(waitMs / 1000);
        return res.status(429).json({
          error: `Aguarde ${retryAfterSec} segundos antes de tentar novamente.`,
          code: "WAIT_BEFORE_RESEND",
          retryAfter: retryAfterSec,
        });
      }
    }

    const code = gen6();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationCode: code,
        emailCodeExpiresAt: expiresAt,
        lastEmailSentAt: new Date(),
      },
    });

    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM!,
        to: [cleanEmail],
        subject: "Redefinição de senha - Ludus",
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>Redefinição de senha</h2>
            <p>Recebemos uma solicitação para redefinir a senha da sua conta Ludus.</p>
            <p>Use o código abaixo:</p>
            <div style="font-size: 32px; letter-spacing: 8px; font-weight: 700; margin: 16px 0;">
              ${code}
            </div>
            <p>Este código expira em <strong>10 minutos</strong>.</p>
            <p>Se você não solicitou isso, ignore este e-mail.</p>
          </div>
        `,
      });
    } catch (e) {
      console.log("Falha ao enviar e-mail de redefinição (Resend):", e);
    }

    return res.status(200).json({
      message: "Se este e-mail estiver cadastrado, você receberá um código.",
    });
  } catch (err) {
    console.error("ERRO /forgot-password:", err);
    return res.status(500).json({ error: "Erro ao processar solicitação." });
  }
});


router.post("/forgot-password/verify", async (req, res) => {
  const { email, code } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanCode = cleanDigits(code);

  if (!cleanEmail) {
    return res.status(400).json({ error: "E-mail é obrigatório." });
  }

  if (!cleanCode || cleanCode.length !== 6) {
    return res.status(400).json({ error: "Código inválido." });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        email: cleanEmail,
        emailVerificationCode: cleanCode,
      },
    });

    if (!user) {
      return res.status(400).json({ error: "Código inválido ou expirado." });
    }

    if (user.emailCodeExpiresAt && user.emailCodeExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: "Código expirado. Solicite um novo." });
    }


    const resetToken = jwt.sign(
      { purpose: "password_reset" },
      process.env.JWT_SECRET || "secret_fallback",
      { subject: user.id, expiresIn: "5m" }
    );


    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationCode: null,
        emailCodeExpiresAt: null,
      },
    });

    return res.json({ resetToken });
  } catch (err) {
    console.error("ERRO /forgot-password/verify:", err);
    return res.status(500).json({ error: "Erro ao verificar código." });
  }
});

router.post("/forgot-password/reset", async (req, res) => {
  const { resetToken, newPassword } = req.body;

  if (!resetToken) {
    return res.status(400).json({ error: "Token de redefinição inválido." });
  }

  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });
  }

  try {
    let payload: { sub: string; purpose: string };

    try {
      payload = jwt.verify(
        resetToken,
        process.env.JWT_SECRET || "secret_fallback"
      ) as any;
    } catch {
      return res.status(400).json({ error: "Token expirado ou inválido. Recomece o processo." });
    }

    if (payload.purpose !== "password_reset") {
      return res.status(400).json({ error: "Token inválido." });
    }

    const userId = payload.sub;
    const hash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: {
        senhaHash: hash,
        lastEmailSentAt: null, 
      },
    });

    return res.json({ message: "Senha redefinida com sucesso!" });
  } catch (err) {
    console.error("ERRO /forgot-password/reset:", err);
    return res.status(500).json({ error: "Erro ao redefinir senha." });
  }
});

export default router;