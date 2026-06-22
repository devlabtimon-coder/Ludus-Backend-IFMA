import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../lib/prisma";

type AuthUserResponse = {
  id: string;
  nome: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  points: number;
  level: number;
  authProvider: string;
  avatar: string | null;
  picture: string | null;
  registrationStatus: string;
  rejectReason: string | null;
  documentFrontImage: string | null;
  addressProof: string | null;
  // 👇 Novos campos IFMA adicionados
  isAcademicVerified: boolean;
  matricula: string | null;
};

function buildUserResponse(user: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  points: number;
  level: number;
  authProvider: string;
  avatar: string | null;
  picture: string | null;
  registrationStatus: string;
  rejectReason: string | null;
  documentFrontImage: string | null;
  addressProof: string | null;
  // 👇 Tipagem para aceitar os campos opcionais do IFMA
  isAcademicVerified?: boolean | null;
  matricula?: string | null;
}): AuthUserResponse {
  return {
    id: user.id,
    nome: user.name,
    name: user.name,
    email: user.email,
    phone: user.phone,
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
    addressProof: user.addressProof,
    // 👇 Repassando os valores do banco para o App
    isAcademicVerified: user.isAcademicVerified || false,
    matricula: user.matricula || null,
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

export async function login(emailOrPhone: string, senha: string) {
  const cleanInput = (emailOrPhone || "").trim().toLowerCase();
  const onlyNumbers = (emailOrPhone || "").replace(/\D/g, "");

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: cleanInput },
        ...(onlyNumbers ? [{ phone: onlyNumbers }] : []),
      ],
    },
  });

  if (!user) {
    throw new Error("Usuário ou senha inválidos");
  }

  if (!user.senhaHash) {
    if (user.authProvider === "GOOGLE") {
      throw new Error(
        "Essa conta usa login com Google. Entre com Google ou crie uma senha local."
      );
    }

    throw new Error("Usuário ou senha inválidos");
  }

  const senhaValida = await bcrypt.compare(senha, user.senhaHash);
  if (!senhaValida) {
    throw new Error("Usuário ou senha inválidos");
  }

  const token = signUserToken(user.id, user.role);

  return {
    token,
    user: buildUserResponse(user),
  };
}

const googleClient = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);

export async function loginWithGoogle(idToken: string) {
  console.log("Token recebido na API:", idToken?.substring(0, 50));

  if (!process.env.GOOGLE_WEB_CLIENT_ID) {
    throw new Error("GOOGLE_WEB_CLIENT_ID não configurado");
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_WEB_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error("Token inválido");
  }

  const email = payload.email?.toLowerCase().trim();
  if (!email) {
    throw new Error("Email não fornecido pelo Google");
  }

  const name = payload.name ?? "Usuário";
  const googleSub = payload.sub;
  const picture = payload.picture ?? null;

  let user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        name,
        email,
        picture,
        emailVerified: true,
        phone: null,
        phoneVerified: false,
        googleSub,
        authProvider: "GOOGLE",
        senhaHash: null,
        points: 0,
        level: 1,
        termsAcceptedAt: new Date(),
        privacyAcceptedAt: new Date(),
        // Os campos de documentos vão receber os defaults do banco (PENDING, null, etc)
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        googleSub: user.googleSub ?? googleSub,
        authProvider: "GOOGLE",
        emailVerified: true,
        picture: user.picture ?? picture,
      },
    });
  }

  const token = signUserToken(user.id, user.role);

  return {
    token,
    user: buildUserResponse(user),
    needsPhoneVerification: !!user.phone && !user.phoneVerified,
  };
}