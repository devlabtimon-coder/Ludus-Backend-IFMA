import { Request, Response, NextFunction } from "express";
import { verify } from "jsonwebtoken";
import { prisma } from "../lib/prisma";

interface IPayload {
  sub: string;
  role: string;
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
      process.env.JWT_SECRET || "secret_fallback"
    ) as IPayload;

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
      },
    });

    if (!user) {
      return res.status(401).json({ error: "Utilizador não encontrado" });
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