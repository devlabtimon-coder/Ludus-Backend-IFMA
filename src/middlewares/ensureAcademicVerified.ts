import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

/**
 * Bloqueia rotas para usuários que ainda não verificaram
 * o vínculo acadêmico via SUAP (apenas na versão IFMA).
 *
 * Só ativo quando IFMA_MODE=true no .env.
 * Isso permite reutilizar o mesmo backend para outros ifima.
 */
export async function ensureAcademicVerified(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Se não está em modo IFMA, ignora essa verificação
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
          "Você precisa verificar seu vínculo acadêmico com o SUAP antes de alugar jogos.",
        code: "ACADEMIC_NOT_VERIFIED",
      });
    }

    return next();
  } catch (err) {
    console.error("Erro em ensureAcademicVerified:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
}