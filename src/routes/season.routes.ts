import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";
import { NotificationType } from "@prisma/client";
import { notifyUser } from "../services/notify.service";

export const seasonRoutes = Router();


export function parseQueryString(value: any): string | undefined {
  if (Array.isArray(value)) return String(value[0]);
  if (typeof value === 'string') return value;
  return undefined;
}

export function parseQueryArray(value: any): string[] | undefined {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return [value];
  return undefined;
}


const DEFAULT_REQUIREMENTS = {
  starter: { alugueisMinimos: 3, diasSemAtraso: 45, avaliacoesMinimas: 2, multasPendentes: 0 },
  family: { alugueisMinimos: 8, diasSemAtraso: 70, avaliacoesMinimas: 4, multasPendentes: 0 },
  expert: { alugueisMinimos: 15, diasSemAtraso: 85, avaliacoesMinimas: 8, multasPendentes: 0 },
  ultragamer: { alugueisMinimos: 25, diasSemAtraso: 91, avaliacoesMinimas: 15, multasPendentes: 0 },
};

const DEFAULT_REWARDS = {
  starter: { cuponsGerados: [{ tipo: "percentual", valor: 10, descricao: "Cupom de 10% OFF no próximo aluguel" }] },
  family: { cuponsGerados: [{ tipo: "fixo", valor: 15, descricao: "R$ 15 OFF no próximo aluguel" }] },
  expert: { cuponsGerados: [{ tipo: "percentual", valor: 25, descricao: "Cupom de 25% OFF" }] },
  ultragamer: { cuponsGerados: [{ tipo: "percentual", valor: 35, descricao: "Cupom de 35% OFF (VIP)" }] },
};

seasonRoutes.get("/", ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const seasons = await prisma.season.findMany({
      orderBy: { startDate: 'desc' }
    });

    const now = new Date();

    const mapped = seasons.map(s => {
      let status = 'encerrada';
      if (now >= s.startDate && now <= s.endDate) status = 'ativa';
      else if (now < s.startDate) status = 'proxima';

      return {
        ...s,
        status,
        banner: {
          corPrimaria: '#2D2D8C',
          corSecundaria: '#FBBC04'
        }
      };
    });

    return res.json(mapped);
  } catch (err) {
    return res.status(500).json({ error: "Erro ao listar temporadas" });
  }
});

seasonRoutes.get("/coupons", ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const coupons = await prisma.coupon.findMany({
      include: { 
        user: { select: { name: true, clientCategory: true } }, 
        season: { select: { name: true } } 
      },
      orderBy: { createdAt: 'desc' }
    });

    const mapped = coupons.map(c => ({
      id: c.id,
      usuario: c.user.name,
      nivel: c.user.clientCategory.toLowerCase(),
      temporada: c.season?.name || 'Avulso',
      codigo: c.code,
      tipo: c.type === 'percentual' ? 'Percentual' : 'Valor Fixo',
      valor: c.type === 'percentual' ? `${c.value}% OFF` : `R$ ${c.value} OFF`,
      emitidoEm: c.createdAt.toISOString().split('T')[0],
      expiraEm: c.expiresAt.toISOString().split('T')[0],
      status: c.isUsed ? 'utilizado' : (new Date() > c.expiresAt ? 'expirado' : 'ativo')
    }));

    return res.json(mapped);
  } catch (err) {
    return res.status(500).json({ error: "Erro ao listar cupons" });
  }
});

seasonRoutes.post("/", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { nome, dataInicio, dataFim, requisitos, recompensas } = req.body;

  if (!nome || !dataInicio || !dataFim) {
    return res.status(400).json({ error: "Nome, data de início e fim são obrigatórios." });
  }

  try {
    const season = await prisma.season.create({
      data: {
        name: nome,
        startDate: new Date(dataInicio),
        endDate: new Date(dataFim),
        requirements: requisitos || DEFAULT_REQUIREMENTS,
        rewards: recompensas || DEFAULT_REWARDS,
      }
    });

    return res.status(201).json(season);
  } catch (err) {
    return res.status(500).json({ error: "Erro ao criar temporada" });
  }
});

seasonRoutes.get("/:id/progress", ensureAuthenticated, ensureAdmin, async (req, res) => {
  
  const seasonId = parseQueryString(req.params.id);
  
  if (!seasonId) {
    return res.status(400).json({ error: "ID da temporada inválido ou ausente." });
  }

  try {
    const season = await prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) return res.status(404).json({ error: "Temporada não encontrada." });

    const requirements = season.requirements as Record<string, any>;

    const users = await prisma.user.findMany({
      where: { role: "USER", isBlocked: false },
      select: { id: true, name: true, clientCategory: true }
    });

    const rentals = await prisma.rental.findMany({
      where: {
        status: "RETURNED",
        endDate: { gte: season.startDate, lte: season.endDate }
      }
    });

    const ratings = await prisma.gameRating.findMany({
      where: { createdAt: { gte: season.startDate, lte: season.endDate } }
    });

    const penalties = await prisma.userPointsLog.findMany({
      where: { points: { lt: 0 }, createdAt: { gte: season.startDate, lte: season.endDate } }
    });

    const generatedCoupons = await prisma.coupon.findMany({
      where: { seasonId: season.id }
    });
    const usersWithCoupons = new Set(generatedCoupons.map(c => c.userId));

    const progressData = users.map(user => {
      const catKey = user.clientCategory.toLowerCase();
      const reqs = requirements[catKey] || requirements.starter;

      const userRentals = rentals.filter(r => r.userId === user.id);
      const userRatings = ratings.filter(r => r.userId === user.id);
      const userPenalties = penalties.filter(p => p.userId === user.id);

      const alugueis = userRentals.length;
      const avaliacoes = userRatings.length;
      const multas = userPenalties.length;

      const diasSemAtraso = userRentals.reduce((acc, curr) => {
        const diffTime = Math.abs(curr.endDate.getTime() - curr.startDate.getTime());
        const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        return acc + diffDays;
      }, 0);

      let score = 0;
      if (alugueis >= reqs.alugueisMinimos) score += 40;
      else score += (alugueis / reqs.alugueisMinimos) * 40;

      if (diasSemAtraso >= reqs.diasSemAtraso) score += 30;
      else score += (diasSemAtraso / reqs.diasSemAtraso) * 30;

      if (avaliacoes >= reqs.avaliacoesMinimas) score += 30;
      else score += (avaliacoes / reqs.avaliacoesMinimas) * 30;

      if (multas > reqs.multasPendentes) score = 0;

      const pct = Math.min(100, Math.round(score));

      return {
        id: user.id,
        nome: user.name,
        nivel: catKey,
        alugueis,
        alugueisMax: reqs.alugueisMinimos,
        diasSemAtraso,
        diasMax: reqs.diasSemAtraso,
        avaliacoes,
        avaliacoesMax: reqs.avaliacoesMinimas,
        multas,
        pct,
        cupomEmitido: usersWithCoupons.has(user.id)
      };
    });

    return res.json(progressData);
  } catch (err) {
    return res.status(500).json({ error: "Erro interno ao calcular progresso" });
  }
});

seasonRoutes.post("/:id/generate-coupons", ensureAuthenticated, ensureAdmin, async (req, res) => {

  const seasonId = parseQueryString(req.params.id);
  
  if (!seasonId) {
    return res.status(400).json({ error: "ID da temporada inválido ou ausente." });
  }

  try {
    const season = await prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) return res.status(404).json({ error: "Temporada não encontrada." });

    const { eligibleUserIds } = req.body; 

    if (!Array.isArray(eligibleUserIds) || eligibleUserIds.length === 0) {
      return res.status(400).json({ error: "Nenhum usuário elegível informado." });
    }

    const rewards = season.rewards as Record<string, any>;
    let count = 0;

    const users = await prisma.user.findMany({
      where: { id: { in: eligibleUserIds } }
    });

    for (const user of users) {
      const alreadyHas = await prisma.coupon.findFirst({
        where: { userId: user.id, seasonId: season.id }
      });

      if (alreadyHas) continue;

      const catKey = user.clientCategory.toLowerCase();
      const userReward = rewards[catKey]?.cuponsGerados?.[0]; 

      if (!userReward) continue;

      const code = `${catKey.substring(0,3).toUpperCase()}-S${season.name.replace(/\D/g, '')}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;

      await prisma.coupon.create({
        data: {
          code,
          type: userReward.tipo,
          value: userReward.valor,
          description: userReward.descricao,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 
          userId: user.id,
          seasonId: season.id
        }
      });

      await notifyUser({
        userId: user.id,
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        title: "Recompensa de Temporada! 🏆",
        body: `Você atingiu 100% da meta e ganhou um cupom: ${code}. Aproveite!`,
        channelId: "system",
      });

      count++;
    }

    return res.json({ message: `${count} cupons gerados com sucesso!`, count });
  } catch (err) {
    return res.status(500).json({ error: "Erro ao gerar cupons." });
  }
});