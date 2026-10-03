import { Router } from "express";
import { RentalController } from "../controllers/RentalController";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureUserOnly } from "../middlewares/ensureUserOnly";

export const rentalRoutes = Router();
const rentalController = new RentalController();

rentalRoutes.post("/", ensureAuthenticated, ensureUserOnly, rentalController.create);
rentalRoutes.get("/me", ensureAuthenticated, rentalController.listMine);
rentalRoutes.patch("/:id/cancel", ensureAuthenticated, ensureUserOnly, rentalController.cancel);
rentalRoutes.get("/game/:gameId/unavailable-dates", ensureAuthenticated, rentalController.unavailableDates);
rentalRoutes.get("/game/:gameId/availability", ensureAuthenticated, rentalController.availability);
