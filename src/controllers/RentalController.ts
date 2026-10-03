import { Request, Response } from "express";
import { HttpError, sendError } from "../errors/HttpError";
import {
  cancelRental,
  createRental,
  getAvailableSlots,
  getUnavailableDates,
  listUserRentals,
} from "../services/rental.service";

export class RentalController {
  async create(req: Request, res: Response) {
    const { gameId, copyId, startDateIso, endDateIso } = req.body;

    if (!gameId || !startDateIso || !endDateIso) {
      return res.status(400).json({ error: "gameId, startDateIso e endDateIso são obrigatórios" });
    }

    try {
      const rental = await createRental(req.user.id, { gameId, copyId, startDateIso, endDateIso });
      return res.status(201).json(rental);
    } catch (err) {
      return sendError(res, err, "Erro interno ao processar a reserva.", "Erro na criação do aluguel:");
    }
  }

  async listMine(req: Request, res: Response) {
    return res.json(await listUserRentals(req.user.id));
  }

  async cancel(req: Request, res: Response) {
    try {
      const rental = await cancelRental(req.user.id, String(req.params.id));
      return res.json(rental);
    } catch (err) {
      return sendError(res, err, "Erro interno ao processar cancelamento.", "Erro ao cancelar aluguel:");
    }
  }

  async unavailableDates(req: Request, res: Response) {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ error: "Ano e mês são obrigatórios." });
    }

    try {
      const unavailableDates = await getUnavailableDates(
        String(req.params.gameId),
        parseInt(String(year), 10),
        parseInt(String(month), 10),
      );
      return res.json({ unavailableDates });
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body);
      throw err;
    }
  }

  async availability(req: Request, res: Response) {
    const { date } = req.query;

    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "A data (YYYY-MM-DD) é obrigatória." });
    }

    try {
      const availableSlots = await getAvailableSlots(String(req.params.gameId), date);
      return res.json({ availableSlots });
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body);
      throw err;
    }
  }
}
