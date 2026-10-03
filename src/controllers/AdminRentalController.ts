import { Request, Response } from "express";
import { RentalStatus } from "@prisma/client";
import { HttpError, sendError } from "../errors/HttpError";
import { listRentals, updateRentalStatus } from "../services/adminRental.service";

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? "";
  return param ?? "";
}

export class AdminRentalController {
  async list(req: Request, res: Response) {
    const { status, q, overdue, page, limit } = req.query;

    try {
      const result = await listRentals({
        status: typeof status === "string" ? status : undefined,
        q: typeof q === "string" ? q : undefined,
        overdue: overdue === "true",
        page: Math.max(1, Number(page) || 1),
        limit: Math.min(100, Math.max(1, Number(limit) || 50)),
      });
      return res.json(result);
    } catch (err) {
      return sendError(res, err, "Erro ao listar aluguéis", "Erro ao listar aluguéis (admin):");
    }
  }

  async updateStatus(req: Request, res: Response) {
    const id = getParam(req.params.id);
    const { status, applyPenalty, penaltyReason } = req.body as {
      status?: RentalStatus;
      applyPenalty?: boolean;
      penaltyReason?: string;
    };

    if (!id) {
      return res.status(400).json({ error: "id inválido" });
    }

    if (!status) {
      return res.status(400).json({ error: "status é obrigatório" });
    }

    try {
      const updated = await updateRentalStatus(req.user.id, id, { status, applyPenalty, penaltyReason });
      return res.json(updated);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body);
      return sendError(res, err, "Erro ao atualizar aluguel", "Erro ao atualizar status (admin):");
    }
  }
}
