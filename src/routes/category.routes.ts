import { Router } from "express";
import { ClientCategory, GameTier } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";
import {
    GAME_TIER_LABELS,
    CLIENT_CATEGORY_LABELS,
    ALLOWED_TIERS,
    setClientCategoryAdmin,
} from "../services/category.service";
import { logAdminAction } from "../services/adminLog.service";

const categoryRoutes = Router();

export { categoryRoutes };

categoryRoutes.get("/config", (_req, res) => {
    return res.json({
        gameTiers: Object.entries(GAME_TIER_LABELS).map(([value, label]) => ({
            value,
            label,
        })),
        clientCategories: Object.entries(CLIENT_CATEGORY_LABELS).map(
            ([value, label]) => ({
                value,
                label,
                allowedTiers: ALLOWED_TIERS[value as ClientCategory],
            })
        ),
    });
});

categoryRoutes.patch(
    "/games/:id/tier",
    ensureAuthenticated,
    ensureAdmin,
    async (req, res) => {
        const idParam = req.params.id;

        if (!idParam || Array.isArray(idParam)) {
            return res.status(400).json({ error: "ID inválido." });
        }

        const id = idParam;
        const { tier } = req.body as { tier?: string };

        if (!tier || !Object.values(GameTier).includes(tier as GameTier)) {
            return res.status(400).json({
                error: "tier inválido. Use: LATAO, BRONZE, PRATA, OURO ou DIAMANTE.",
            });
        }

        try {
            const game = await prisma.game.findUnique({ where: { id } });

            if (!game) {
                return res.status(404).json({ error: "Jogo não encontrado." });
            }

            const updated = await prisma.game.update({
                where: { id },
                data: { tier: tier as GameTier },
                select: {
                    id: true,
                    title: true,
                    tier: true,
                },
            });

            await logAdminAction(req.user.id, "UPDATE_GAME_TIER", id, { newTier: tier });

            return res.json({
                message: `Jogo "${updated.title}" classificado como ${GAME_TIER_LABELS[updated.tier]}.`,
                game: updated,
            });
        } catch (err) {
            console.error("Erro ao classificar jogo:", err);
            return res.status(500).json({ error: "Erro ao classificar jogo." });
        }
    }
);

categoryRoutes.patch(
    "/users/:id/category",
    ensureAuthenticated,
    ensureAdmin,
    async (req, res) => {
        const idParam = req.params.id;

        if (!idParam || Array.isArray(idParam)) {
            return res.status(400).json({ error: "ID inválido." });
        }

        const id = idParam;
        const { clientCategory } = req.body as { clientCategory?: string };

        if (
            !clientCategory ||
            !Object.values(ClientCategory).includes(clientCategory as ClientCategory)
        ) {
            return res.status(400).json({
                error: "clientCategory inválida. Use: STARTER, FAMILY, EXPERT ou ULTRAGAMER.",
            });
        }

        try {
            const user = await prisma.user.findUnique({ where: { id } });

            if (!user) {
                return res.status(404).json({ error: "Usuário não encontrado." });
            }

            const result = await setClientCategoryAdmin(
                id,
                clientCategory as ClientCategory
            );

            await logAdminAction(req.user.id, "CHANGE_USER_CATEGORY", id, { newCategory: clientCategory });

            return res.json({
                message: `Usuário classificado como ${CLIENT_CATEGORY_LABELS[result.clientCategory]}.`,
                userId: id,
                clientCategory: result.clientCategory,
                clientCategoryLabel: CLIENT_CATEGORY_LABELS[result.clientCategory],
            });
        } catch (err) {
            console.error("Erro ao classificar cliente:", err);
            return res.status(500).json({ error: "Erro ao classificar cliente." });
        }
    }
);

categoryRoutes.get(
    "/users",
    ensureAuthenticated,
    ensureAdmin,
    async (req, res) => {
        const { category, q } = req.query;

        const where: any = {};

        if (
            typeof category === "string" &&
            Object.values(ClientCategory).includes(category as ClientCategory)
        ) {
            where.clientCategory = category as ClientCategory;
        }

        if (typeof q === "string" && q.trim()) {
            const term = q.trim();
            where.OR = [
                { name: { contains: term, mode: "insensitive" } },
                { email: { contains: term, mode: "insensitive" } },
            ];
        }

        try {
            const users = await prisma.user.findMany({
                where,
                orderBy: [{ clientCategory: "asc" }, { name: "asc" }],
                select: {
                    id: true,
                    name: true,
                    email: true,
                    clientCategory: true,
                    totalRentalsCount: true,
                    level: true,
                    points: true,
                    avatar: true,
                }
            });

            return res.json(
                users.map((u) => ({
                    ...u,
                    avatar: u.avatar, 
                    clientCategoryLabel: CLIENT_CATEGORY_LABELS[u.clientCategory],
                }))
            );
        } catch (err) {
            console.error("Erro ao listar clientes:", err);
            return res.status(500).json({ error: "Erro ao listar clientes." });
        }
    }
);