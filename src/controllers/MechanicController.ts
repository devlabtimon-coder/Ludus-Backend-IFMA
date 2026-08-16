import { Request, Response } from 'express';
import { prisma } from '../lib/prisma'; 

export class MechanicController {

  async getGuideMechanics(req: Request, res: Response) {
    try {
      const mechanics = await prisma.mechanic.findMany({
        where: { active: true },
        include: {
          games: {
            select: { id: true, title: true }
          }
        },
        orderBy: { namePt: 'asc' }
      });
      return res.json(mechanics);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao buscar mecânicas' });
    }
  }


  async getAllForAdmin(req: Request, res: Response) {
    try {
      const mechanics = await prisma.mechanic.findMany({
        include: { _count: { select: { games: true } } },
        orderBy: { namePt: 'asc' }
      });
      return res.json(mechanics);
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar mecânicas' });
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
              category: m.chip,
              definition: m.definition,
              icon: m.icon,
            }
          })
        )
      );

      return res.status(201).json({ message: 'Carga concluída com sucesso!', count: created.length });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Falha na carga em massa' });
    }
  }
}