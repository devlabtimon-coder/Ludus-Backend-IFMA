import { Router } from "express";
import { AdminRentalController } from "../controllers/AdminRentalController";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";

export const adminRentalRoutes = Router();
const adminRentalController = new AdminRentalController();

adminRentalRoutes.get("/", ensureAuthenticated, ensureAdmin, adminRentalController.list);
adminRentalRoutes.patch("/:id/status", ensureAuthenticated, ensureAdmin, adminRentalController.updateStatus);
