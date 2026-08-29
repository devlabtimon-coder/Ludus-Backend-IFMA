import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";
import { NotificationType } from "@prisma/client";
import { notifyUser } from "../services/notify.service";
import { getLevelName } from "../services/engagement.service";

export const seasonRoutes = Router();

export function parseQueryString(value: any): string | undefined {
  if (Array.isArray(value)) return String(value[0]);
  if (typeof value === 'string') return value;
  return undefined;
}


const MAX_SEASON_POINTS = 1500;


const DEFAULT_REWARDS = {
  nivel2: { cuponsGerados: [{ tipo: "percentual", valor: 5, descricao: "Cupom 5% OFF - Nível 2" }] },
  nivel3: { cuponsGerados: [{ tipo: "percentual", valor: 10, descricao: "Cupom 10% OFF - Nível 3" }] },
  nivel4: { cuponsGerados: [{ tipo: "fixo", valor: 15, descricao: "R$ 15 OFF - Nível 4" }] },
  nivel5: { cuponsGerados: [{ tipo: "percentual", valor: 25, descricao: "Cupom 25% OFF - Lenda!" }] },
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
        banner: { corPrimaria: '#2D2D8C', corSecundaria: '#FBBC04' }
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
        user: { select: { name: true, level: true } }, 
        season: { select: { name: true } } 
      },
      orderBy: { createdAt: 'desc' }
    });
    const mapped = coupons.map(c => ({
      id: c.id,
      usuario: c.user.name,
      nivel: getLevelName(c.user.level), 
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
  const { nome, dataInicio, dataFim, recompensas, overrideActive } = req.body;

  if (!nome || !dataInicio || !dataFim) {
    return res.status(400).json({ error: "Nome, data de início e fim são obrigatórios." });
  }
  
  try {
    const startDate = new Date(dataInicio);
    const endDate = new Date(dataFim);
    const now = new Date();

    
    if (startDate <= now) {
      const existingActive = await prisma.season.findFirst({
        where: {
          startDate: { lte: now },
          endDate: { gte: now }
        }
      });

      if (existingActive && !overrideActive) {
        return res.status(409).json({
          error: `A "${existingActive.name}" está ativa no momento. Deseja encerrá-la e zerar os pontos de todos os alunos agora?`,
          code: "ACTIVE_SEASON_EXISTS"
        });
      }
    }

    
    const season = await prisma.season.create({
      data: {
        name: nome,
        startDate,
        endDate,
        rewards: recompensas || DEFAULT_REWARDS,
      }
    });

   
    if (startDate <= now) {
      await prisma.season.updateMany({
        where: {
          id: { not: season.id },
          startDate: { lte: now },
          endDate: { gte: now }
        },
        data: { 
          endDate: new Date(now.getTime() - 1000) 
        } 
      });

      await prisma.user.updateMany({
        where: { role: "USER" },
        data: { points: 0, level: 1 }
      });
    }

    return res.status(201).json(season);
  } catch (err) {
    console.error("Erro ao criar temporada:", err);
    return res.status(500).json({ error: "Erro ao criar temporada" });
  }
});

seasonRoutes.get("/:id/progress", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const seasonId = parseQueryString(req.params.id);
  if (!seasonId) return res.status(400).json({ error: "ID da temporada inválido." });

  try {
    const season = await prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) return res.status(404).json({ error: "Temporada não encontrada." });

    const users = await prisma.user.findMany({
      where: { role: "USER", isBlocked: false },
      select: { id: true, name: true, level: true, points: true, clientCategory: true }
    });

  
    const rentals = await prisma.rental.findMany({
      where: { status: "RETURNED", endDate: { gte: season.startDate, lte: season.endDate } }
    });
    const penalties = await prisma.userPointsLog.findMany({
      where: { points: { lt: 0 }, createdAt: { gte: season.startDate, lte: season.endDate } }
    });
    const generatedCoupons = await prisma.coupon.findMany({
      where: { seasonId: season.id }
    });
    const usersWithCoupons = new Set(generatedCoupons.map(c => c.userId));

   
    const progressData = users.map(user => {
      const userRentals = rentals.filter(r => r.userId === user.id);
      const multas = penalties.filter(p => p.userId === user.id).length;
      
      const alugueis = userRentals.length;
      const diasSemAtraso = userRentals.reduce((acc, curr) => {
        const diffTime = Math.abs(curr.endDate.getTime() - curr.startDate.getTime());
        return acc + Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      }, 0);

     
      const pct = Math.min(100, Math.round((user.points / MAX_SEASON_POINTS) * 100));

      return {
        id: user.id,
        nome: user.name,
        nivel: user.clientCategory.toLowerCase(), 
        currentLevel: user.level, 
        alugueis,
        alugueisMax: 0, 
        diasSemAtraso,
        diasMax: 0, 
        avaliacoes: user.points, 
        avaliacoesMax: MAX_SEASON_POINTS,
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
  if (!seasonId) return res.status(400).json({ error: "ID da temporada inválido." });

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

      
      const levelKey = `nivel${user.level}`;
      const userReward = rewards[levelKey]?.cuponsGerados?.[0]; 

      if (!userReward) continue;

      const code = `NIVEL${user.level}-S${season.name.replace(/\D/g, '')}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;

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
        title: "Recompensa de Temporada!",
        body: `Você bateu os pontos da temporada e ganhou um cupom: ${code}. Aproveite!`,
        channelId: "system",
      });
      count++;
    }

    return res.json({ message: `${count} cupons gerados com sucesso!`, count });
  } catch (err) {
    return res.status(500).json({ error: "Erro ao gerar cupons." });
  }
});

seasonRoutes.get("/:id/ranking", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const seasonId = parseQueryString(req.params.id);
  if (!seasonId) return res.status(400).json({ error: "ID da temporada inválido." });

  try {
    const season = await prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) return res.status(404).json({ error: "Temporada não encontrada." });

    const users = await prisma.user.findMany({
      where: { role: "USER", isBlocked: false },
      select: { id: true, name: true, email: true, avatar: true, picture: true, clientCategory: true, totalRentalsCount: true }
    });

   
    const logs = await prisma.userPointsLog.groupBy({
      by: ['userId'],
      where: {
        createdAt: {
          gte: season.startDate,
          lte: season.endDate,
        },
      },
      _sum: {
        points: true,
      },
    });

    const pointsMap = new Map(logs.map(l => [l.userId, l._sum.points || 0]));

    const ranking = users.map(u => ({
      ...u,
      points: pointsMap.get(u.id) || 0,
    })).sort((a, b) => b.points - a.points);

    return res.json(ranking);
  } catch (err) {
    return res.status(500).json({ error: "Erro ao buscar ranking da temporada." });
  }
});