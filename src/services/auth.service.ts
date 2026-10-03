import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../lib/prisma";
import { signedDocumentUrl } from "../lib/documentStorage";

const googleClient = new OAuth2Client();

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
  documentFile: string | null;
  addressProof: string | null;
  isAcademicVerified: boolean;
  matricula: string | null;
};

interface GooglePayload {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  sub?: string;
}

function buildUserResponse(user: any): AuthUserResponse {
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
    documentFile: signedDocumentUrl(user.documentFile),
    addressProof: signedDocumentUrl(user.addressProof),
    isAcademicVerified: user.isAcademicVerified || false,
    matricula: user.matricula || null,
  };
}

function signUserToken(userId: string, role: string) {
  return jwt.sign(
    { role },
    process.env.JWT_SECRET as string,
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

// Client IDs OAuth públicos do Ludus (web, Android e iOS). Usados quando
// GOOGLE_CLIENT_IDS não está definido no ambiente.
const DEFAULT_GOOGLE_CLIENT_IDS = [
  "706484468010-usc5ukmojk20cmvd005atqbfn9kst25l.apps.googleusercontent.com",
  "706484468010-8vkl29n2em35g4s3md470impvlk68lho.apps.googleusercontent.com",
  "706484468010-s8rkf8o3vok29vlpnp0fi9gaqb9602gn.apps.googleusercontent.com",
  "1008142639242-d4q2e3cpr97q87bm3ovs9h3jagefsojr.apps.googleusercontent.com",
];

// Tokens emitidos para qualquer outro app são recusados.
function getAllowedGoogleClientIds(): string[] {
  const fromEnv = (process.env.GOOGLE_CLIENT_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_GOOGLE_CLIENT_IDS;
}

// Aceita ID token (app mobile) ou access token (web admin), sempre conferindo o client ID de origem.
export async function verifyGoogleToken(token: string): Promise<GooglePayload> {
  if (!token) throw new Error("Token do Google ausente.");

  const allowedClientIds = getAllowedGoogleClientIds();
  const isJwt = token.split(".").length === 3;

  try {
    if (isJwt) {
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: allowedClientIds,
      });
      const payload = ticket.getPayload();
      if (!payload) throw new Error("payload vazio");
      return payload;
    }

    const info = await googleClient.getTokenInfo(token);
    const issuedTo = [info.aud, info.azp].filter(Boolean) as string[];
    if (!issuedTo.some((id) => allowedClientIds.includes(id))) {
      throw new Error("audience não permitida");
    }
    return info as unknown as GooglePayload;
  } catch (err: any) {
    console.warn("Falha ao validar token Google:", err?.message || err);
    throw new Error("Token Google forjado, inválido ou expirado.");
  }
}

export async function loginWithGoogle(token: string) {
  if (!token) {
    throw new Error("Token não fornecido.");
  }

  const payload = await verifyGoogleToken(token);
  const email = payload.email?.toLowerCase().trim();

  if (!email) {
    throw new Error("A sua conta Google não forneceu um e-mail válido.");
  }

  if (payload.email_verified === false) {
    throw new Error("O e-mail da conta Google não está verificado.");
  }

  if (!email.endsWith("@ifma.edu.br") && !email.endsWith("@acad.ifma.edu.br")) {
    throw new Error("Apenas e-mails institucionais do IFMA são permitidos.");
  }

  const name = payload.name ?? "Usuário";
  const googleSub = payload.sub;
  const picture = payload.picture ?? null;

  let user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return {
      isNewUser: true,
      needsCompletion: true,
      user: { email, name }
    };
  }

  user = await prisma.user.update({
    where: { id: user.id },
    data: {
      googleSub: user.googleSub ?? googleSub, 
      authProvider: "GOOGLE",
      emailVerified: true,
      picture: user.picture ?? picture,
    },
  });

  if (!user.matricula) {
    return {
      needsCompletion: true,
      user: { email, name: user.name }
    };
  }

  const jwtToken = signUserToken(user.id, user.role);

  return {
    token: jwtToken,
    user: buildUserResponse(user),
    needsPhoneVerification: !!user.phone && !user.phoneVerified,
  };
}