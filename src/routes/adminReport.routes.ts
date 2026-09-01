import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";

export const adminReportRoutes = Router();

adminReportRoutes.get("/", ensureAuthenticated, ensureAdmin, async (req, res) => {
  try {
    const period = (req.query.period as string) || 'month'; 
    const now = new Date();
    let startDate = new Date();

    if (period === 'week') {
      startDate.setDate(now.getDate() - 7);
    } else if (period === 'year') {
      startDate.setFullYear(now.getFullYear() - 1);
    } else { 
      startDate.setDate(now.getDate() - 30);
    }

  
    const totalRentals = await prisma.rental.count({ where: { startDate: { gte: startDate } } });
    const uniqueGamesRented = (await prisma.rental.groupBy({ by: ['gameId'], where: { startDate: { gte: startDate } } })).length;
    const totalUsers = Math.max(1, await prisma.user.count({ where: { role: 'USER' } }));
    
   
    const totalCopies = await prisma.gameCopy.count();
    const availableCopies = await prisma.gameCopy.count({ where: { available: true } });
    const maintenanceCopies = await prisma.gameCopy.count({ where: { available: false } });
    const rentedCopies = await prisma.rental.count({ where: { status: { in: ['ACTIVE', 'PENDING'] } } });
    const occupancyRate = totalCopies > 0 ? Math.round((rentedCopies / totalCopies) * 100) : 0;

  
    const rentalsGrouped = await prisma.rental.groupBy({
      by: ['gameId'],
      where: { startDate: { gte: startDate } },
      _count: { gameId: true },
      orderBy: { _count: { gameId: 'desc' } },
      take: 6,
    });

    const topGames = await Promise.all(rentalsGrouped.map(async (g) => {
      const game = await prisma.game.findUnique({ where: { id: String(g.gameId) }, select: { title: true } });
      return {
        id: g.gameId,
        name: game?.title || 'Jogo Excluído',
        count: g._count.gameId
      };
    }));

    
    const activeUsersCount = await prisma.rental.groupBy({
      by: ['userId'],
      where: { startDate: { gte: startDate } }
    }).then(res => res.length);

    const newUsers = await prisma.user.count({
      where: { createdAt: { gte: startDate }, role: 'USER' }
    });

    const topUsersGroup = await prisma.rental.groupBy({
      by: ['userId'],
      where: { startDate: { gte: startDate } },
      _count: { userId: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 3,
    });

    const topUsers = await Promise.all(topUsersGroup.map(async (u) => {
      const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { name: true, email: true, clientCategory: true, avatar: true, picture: true } });
      return {
        name: user?.name || 'Desconhecido',
        email: user?.email || 'N/A',
        category: user?.clientCategory || 'STARTER',
        rentals: u._count.userId,
        avatar: user?.avatar,
        picture: user?.picture
      };
    }));

   
    const recentRentals = await prisma.rental.findMany({
      where: { startDate: { gte: startDate } },
      orderBy: { startDate: 'desc' },
      take: 10,
      include: { 
        user: { select: { name: true, email: true, matricula: true, avatar: true, picture: true } }, 
        game: { select: { title: true, tier: true } } 
      }
    });

    const history = recentRentals.map(r => ({
      id: r.id,
      user: { name: r.user.name, email: r.user.email, membershipNumber: r.user.matricula || 'N/A', avatar: r.user.avatar, picture: r.user.picture },
      game: r.game?.title || r.gameTitleSnapshot,
      category: r.game?.tier || 'BRONZE',
      startDate: r.startDate.toLocaleDateString('pt-BR'),
      endDate: r.endDate.toLocaleDateString('pt-BR'),
      duration: Math.ceil(Math.abs(r.endDate.getTime() - r.startDate.getTime()) / (1000 * 60 * 60 * 24)) || 1,
      status: r.status === 'RETURNED' ? 'Concluído' : r.status === 'ACTIVE' ? 'Em Andamento' : r.status === 'CANCELED' ? 'Cancelado' : 'Pendente'
    }));

   
    const evolution = [];
    if (period === 'week') {
     
      for (let i = 6; i >= 0; i--) {
        const dStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
        const count = await prisma.rental.count({ where: { startDate: { gte: dStart, lt: dEnd } } });
        evolution.push({ label: dStart.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), rentals: count });
      }
    } else if (period === 'year') {
    
      for (let i = 11; i >= 0; i--) {
        const dStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const dEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const count = await prisma.rental.count({ where: { startDate: { gte: dStart, lt: dEnd } } });
        evolution.push({ label: dStart.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), rentals: count });
      }
    } else {
      
      for (let i = 4; i >= 0; i--) {
        const dStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (i * 6) - 6);
        const dEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (i * 6));
        const count = await prisma.rental.count({ where: { startDate: { gte: dStart, lt: dEnd } } });
        evolution.push({ label: `${dStart.getDate()}/${dStart.getMonth()+1}`, rentals: count });
      }
    }

    res.json({
      kpis: {
        totalRentals: { value: totalRentals.toString(), tag: period === 'week' ? 'Últimos 7 dias' : period === 'year' ? 'Últimos 12 meses' : 'Últimos 30 dias' },
        uniqueGames: { value: uniqueGamesRented.toString(), tag: 'Jogos distintos' },
        avgRentalDays: { value: '3.0', subtitle: 'Dias por aluguel' },
        engagementRate: { value: `${Math.round((activeUsersCount / totalUsers) * 100)}%`, tag: 'Usuários ativos' },
      },
      topGames,
      evolution,
      collection: {
        available: availableCopies,
        rented: rentedCopies,
        maintenance: maintenanceCopies,
        total: totalCopies,
        occupancyRate
      },
      engagement: {
        activeUsers: activeUsersCount,
        activeUsersChange: 0, 
        inactiveUsers: totalUsers - activeUsersCount,
        inactiveUsersChange: 0, 
        avgRentalsPerUser: Math.round((totalRentals / Math.max(1, activeUsersCount)) * 10) / 10,
        newUsers,
        topUsers
      },
      history
    });
  } catch (error) {
    console.error("Erro ao gerar relatórios:", error);
    res.status(500).json({ error: "Erro interno ao gerar relatórios." });
  }
});