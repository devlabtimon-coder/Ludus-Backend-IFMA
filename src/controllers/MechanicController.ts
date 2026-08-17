import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const parseString = (value: any): string => {
  if (Array.isArray(value)) return String(value[0]);
  return String(value);
};

export class MechanicController {
  async getGuideMechanics(req: Request, res: Response) {
    try {
      const mechanics = await prisma.mechanic.findMany({
        where: { active: true },
        orderBy: { namePt: 'asc' }
      });

      const mechanicsWithGames = await Promise.all(
        mechanics.map(async (m) => {
          const games = await prisma.game.findMany({
            where: { mechanics: { has: m.namePt } },
            select: { id: true, title: true }
          });
          return { ...m, games };
        })
      );

      return res.json(mechanicsWithGames);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar mecânicas para o guia.' });
    }
  }

  async getAllForAdmin(req: Request, res: Response) {
    try {
      const mechanics = await prisma.mechanic.findMany({
        orderBy: { namePt: 'asc' }
      });

      const mechanicsWithGames = await Promise.all(
        mechanics.map(async (m) => {
          const games = await prisma.game.findMany({
            where: { mechanics: { has: m.namePt } },
            select: { id: true, title: true }
          });
          return { ...m, games };
        })
      );

      return res.json(mechanicsWithGames);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar mecânicas para o admin.' });
    }
  }

  async createMechanic(req: Request, res: Response) {
    try {
      const { namePt, nameEn, category, definition, icon, active } = req.body;

      const mechanicExists = await prisma.mechanic.findUnique({ where: { namePt } });
      if (mechanicExists) {
        return res.status(400).json({ error: 'Uma mecânica com este nome já existe.' });
      }

      const mechanic = await prisma.mechanic.create({
        data: { namePt, nameEn, category, definition, icon, active }
      });

      return res.status(201).json(mechanic);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar mecânica.' });
    }
  }

  async bulkCreate(req: Request, res: Response) {
    try {
      const { mechanics } = req.body;

      const created = await prisma.$transaction(
        mechanics.map((m: any) =>
          prisma.mechanic.upsert({
            where: { namePt: m.namePt },
            update: {},
            create: {
              namePt: m.namePt,
              nameEn: m.nameEn,
              category: m.chip || m.category,
              definition: m.definition,
              icon: m.icon || 'settings-outline',
            }
          })
        )
      );

      return res.status(201).json({ message: 'Carga concluída com sucesso!', count: created.length });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Falha na carga em massa.' });
    }
  }

  async updateMechanic(req: Request, res: Response) {
    try {
      const id = parseString(req.params.id);
      const { namePt, nameEn, category, definition, icon, active } = req.body;

      const oldMechanic = await prisma.mechanic.findUnique({ where: { id } });
      if (!oldMechanic) {
        return res.status(404).json({ error: 'Mecânica não encontrada.' });
      }

      if (namePt && namePt !== oldMechanic.namePt) {
        const gamesToUpdate = await prisma.game.findMany({
          where: { mechanics: { has: oldMechanic.namePt } }
        });

        const updateGamesPromises = gamesToUpdate.map(game => {
          const updatedMechanics = game.mechanics.map(m => m === oldMechanic.namePt ? namePt : m);
          return prisma.game.update({
            where: { id: game.id },
            data: { mechanics: updatedMechanics }
          });
        });

        await prisma.$transaction([
          ...updateGamesPromises,
          prisma.mechanic.update({
            where: { id },
            data: { namePt, nameEn, category, definition, icon, active }
          })
        ]);
      } else {
        await prisma.mechanic.update({
          where: { id },
          data: { namePt, nameEn, category, definition, icon, active }
        });
      }

      const updatedMechanic = await prisma.mechanic.findUnique({ where: { id } });
      return res.json(updatedMechanic);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar mecânica.' });
    }
  }

  async deleteMechanic(req: Request, res: Response) {
    try {
      const id = parseString(req.params.id);

      const oldMechanic = await prisma.mechanic.findUnique({ where: { id } });
      if (!oldMechanic) {
        return res.status(404).json({ error: 'Mecânica não encontrada.' });
      }

      const gamesToUpdate = await prisma.game.findMany({
        where: { mechanics: { has: oldMechanic.namePt } }
      });

      const updateGamesPromises = gamesToUpdate.map(game => {
        const updatedMechanics = game.mechanics.filter(m => m !== oldMechanic.namePt);
        return prisma.game.update({
          where: { id: game.id },
          data: { mechanics: updatedMechanics }
        });
      });

      await prisma.$transaction([
        ...updateGamesPromises,
        prisma.mechanic.delete({ where: { id } })
      ]);

      return res.status(204).send();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao excluir mecânica.' });
    }
  }
}