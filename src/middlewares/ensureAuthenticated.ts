import { Request, Response, NextFunction } from "express";
import { verify } from "jsonwebtoken";
import { prisma } from "../lib/prisma";

interface IPayload {
  sub: string;
  role: string;
  iat?: number;
  purpose?: string;
}

export async function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Token não enviado" });
  }

  const [, token] = authHeader.split(" ");

  try {
    const decoded = verify(
      token,
      process.env.JWT_SECRET as string 
    ) as IPayload;

    // Tokens de propósito específico (ex.: redefinição de senha) não valem como sessão.
    if (decoded.purpose) {
      return res.status(401).json({ error: "Token inválido" });
    }

    const userId = decoded.sub;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        email: true,
        phone: true,
        emailVerified: true,
        phoneVerified: true,
        isBlocked: true, 
        passwordChangedAt: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: "Utilizador não encontrado" });
    }

    // Sessões abertas antes da última troca de senha são invalidadas.
    if (
      user.passwordChangedAt &&
      (decoded.iat ?? 0) < Math.floor(user.passwordChangedAt.getTime() / 1000)
    ) {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        error: "Sua conta foi bloqueada por um administrador.",
        code: "ACCOUNT_BLOCKED",
      });
    }

    const hasVerifiedEmail = !!user.email && !!user.emailVerified;
    const hasVerifiedPhone = !!user.phone && !!user.phoneVerified;

    if (!hasVerifiedEmail && !hasVerifiedPhone) {
      return res.status(403).json({
        error: "Sua conta precisa ser verificada por e-mail ou telefone.",
        code: "ACCOUNT_NOT_VERIFIED",
      });
    }

    req.user = { id: user.id, role: user.role };
    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}