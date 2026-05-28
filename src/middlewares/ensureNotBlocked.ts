// src/middlewares/ensureNotBlocked.ts
import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

export async function ensureNotBlocked(req: Request, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { isBlocked: true },
  });

  if (user?.isBlocked) {
    return res.status(403).json({ error: "Sua conta foi bloqueada por um administrador." });
  }
  next();
}