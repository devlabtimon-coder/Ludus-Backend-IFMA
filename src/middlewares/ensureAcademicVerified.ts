import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

export async function ensureAcademicVerified(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (process.env.IFMA_MODE !== "true") {
    return next();
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { isAcademicVerified: true },
    });

    if (!user?.isAcademicVerified) {
      return res.status(403).json({
        error:
          "Você precisa enviar seu comprovante de matrícula e aguardar aprovação antes de alugar jogos.",
        code: "ACADEMIC_NOT_VERIFIED",
      });
    }

    return next();
  } catch (err) {
    console.error("Erro em ensureAcademicVerified:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
}