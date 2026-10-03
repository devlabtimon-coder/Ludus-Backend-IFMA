import express from "express";
import jwt from "jsonwebtoken";
import { rentalRoutes } from "../../src/routes/rental.routes";
import { adminRentalRoutes } from "../../src/routes/adminRental.routes";

// Monta as rotas reais (com os middlewares de autenticação) num app enxuto.
export function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/rentals", rentalRoutes);
  app.use("/admin/rentals", adminRentalRoutes);
  return app;
}

export function authHeader(user: { id: string; role: string }) {
  const token = jwt.sign({ role: user.role }, process.env.JWT_SECRET as string, {
    subject: user.id,
    expiresIn: "1h",
  });
  return { Authorization: `Bearer ${token}` };
}
