import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";

export const gameCopyRoutes = Router();

// Função utilitária para gerar o código patrimonial caso o admin não digite um
function formatCopyCode(title: string, num: number) {
    const slug = title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .toUpperCase()
        .slice(0, 12);

    return `${slug}-${String(num).padStart(3, "0")}`;
}

// =======================================================
// GET: Listar apenas cópias disponíveis (Usado no App)
// =======================================================
gameCopyRoutes.get("/:gameId/copies/available", ensureAuthenticated, async (req, res) => {
  const { gameId } = req.params;

  try {
    const game = await prisma.game.findUnique({ where: { id: String(gameId) } });
    if (!game) return res.status(404).json({ error: "Jogo não encontrado" });

    const copies = await prisma.gameCopy.findMany({
      where: { gameId: String(gameId), available: true },
      orderBy: { number: "asc" },
      select: { id: true, code: true, number: true, condition: true, available: true },
    });

    return res.json(copies);
  } catch (err) {
    console.error("Erro ao listar exemplares disponíveis:", err);
    return res.status(500).json({ error: "Erro ao listar exemplares disponíveis" });
  }
});

// =======================================================
// GET: Listar todas as cópias de um jogo (Painel Admin)
// =======================================================
gameCopyRoutes.get("/:gameId/copies", ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { gameId } = req.params;

    try {
        const game = await prisma.game.findUnique({ where: { id: String(gameId) } });
        if (!game) return res.status(404).json({ error: "Jogo não encontrado" });

        const copies = await prisma.gameCopy.findMany({
            where: { gameId: String(gameId) },
            orderBy: { number: "asc" },
        });

        return res.json(copies);
    } catch (err) {
        console.error("Erro ao listar exemplares:", err);
        return res.status(500).json({ error: "Erro ao listar exemplares" });
    }
});

// =======================================================
// POST: Criar um novo exemplar (Painel Admin)
// =======================================================
gameCopyRoutes.post("/:gameId/copies", ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { gameId } = req.params;
    // O frontend pode mandar só a condition, ou mandar os outros para sobrescrever a automação
    const { condition, code: customCode, available, observations } = req.body;

    try {
        const copy = await prisma.$transaction(async (tx) => {
            const game = await tx.game.findUnique({ where: { id: String(gameId) } });
            if (!game) {
                const e: any = new Error("GAME_NOT_FOUND");
                e.code = "GAME_NOT_FOUND";
                throw e;
            }

            // Descobre qual é a última cópia para gerar o próximo número sequencial
            const max = await tx.gameCopy.aggregate({
                where: { gameId: String(gameId) },
                _max: { number: true },
            });

            const nextNumber = (max._max.number ?? 0) + 1;
            
            // Usa o código customizado (se o admin mandou) ou auto-gera
            const finalCode = customCode && String(customCode).trim() !== "" 
                ? String(customCode).trim() 
                : formatCopyCode(game.title, nextNumber);

            return tx.gameCopy.create({
                data: {
                    gameId: String(gameId),
                    number: nextNumber,
                    code: finalCode,
                    condition: typeof condition === "string" ? condition.trim() : null,
                    available: typeof available === "boolean" ? available : true,
                    observations: typeof observations === "string" ? observations.trim() : null,
                },
            });
        });

        return res.status(201).json(copy);
    } catch (err: any) {
        if (err?.code === "GAME_NOT_FOUND") {
            return res.status(404).json({ error: "Jogo não encontrado" });
        }

        if (err?.code === "P2002") {
            return res.status(409).json({ error: "Conflito ao gerar número ou código do exemplar. Tente novamente." });
        }

        console.error("Erro ao criar exemplar:", err);
        return res.status(500).json({ error: "Erro ao criar exemplar" });
    }
});

// =======================================================
// PATCH: Editar um exemplar existente (Painel Admin)
// =======================================================
gameCopyRoutes.patch("/copies/:copyId", ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { copyId } = req.params;
    const { code, condition, available, observations } = req.body;

    const data: any = {};
    
    // Só atualiza os campos que realmente vieram na requisição
    if (typeof code === "string") data.code = code.trim();
    if (typeof condition === "string") data.condition = condition.trim();
    if (typeof available === "boolean") data.available = available;
    
    // Atualiza ou limpa as observações
    if (typeof observations === "string") {
        data.observations = observations.trim();
    } else if (observations === null) {
        data.observations = null; 
    }

    try {
        const updated = await prisma.gameCopy.update({
            where: { id: String(copyId) },
            data,
        });

        return res.json(updated);
    } catch (err: any) {
        console.error("Erro ao atualizar exemplar:", err);
        if (err?.code === "P2025") return res.status(404).json({ error: "Exemplar não encontrado" });
        return res.status(500).json({ error: "Erro ao atualizar exemplar" });
    }
});

// =======================================================
// DELETE: Excluir um exemplar (Painel Admin)
// =======================================================
gameCopyRoutes.delete("/copies/:copyId", ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { copyId } = req.params;

    try {
        // Trava de segurança: Não pode excluir se a caixa já foi alugada alguma vez (perderia o histórico)
        const rentalsCount = await prisma.rental.count({ where: { copyId: String(copyId) } });
        
        if (rentalsCount > 0) {
            return res.status(409).json({
                error: "Não é possível excluir este exemplar porque ele possui histórico de aluguel.",
                code: "COPY_HAS_RENTALS",
            });
        }

        await prisma.gameCopy.delete({ where: { id: String(copyId) } });
        
        return res.json({ ok: true });
    } catch (err: any) {
        console.error("Erro ao excluir exemplar:", err);
        if (err?.code === "P2025") return res.status(404).json({ error: "Exemplar não encontrado" });
        return res.status(500).json({ error: "Erro ao excluir exemplar" });
    }
});