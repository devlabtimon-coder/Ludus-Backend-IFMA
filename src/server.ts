import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { prisma } from './lib/prisma';
import authRoutes from "./routes/auth.routes";
import { gameRoutes } from "./routes/game.routes";
import { gameCopyRoutes } from "./routes/gameCopy.routes";
import { rentalRoutes } from "./routes/rental.routes";
import { adminRentalRoutes } from "./routes/adminRental.routes";
import { engagementRoutes } from "./routes/engagement.routes";
import { favoritesRoutes } from "./routes/favorites.routes";
import { pushTokenRoutes } from "./routes/pushToken.routes";
import { notificationRoutes } from "./routes/notification.routes";
import { startRentalReminderJob } from "./jobs/rentalReminders";
import { gameWatchRoutes } from "./routes/gameWatch.routes";
import { userProfileRoutes } from "./routes/userProfile.routes";
import { categoryRoutes } from "./routes/category.routes";
import ifmaRoutes from "./routes/ifma.routes";
import { adminUserRoutes } from "./routes/adminUser.routes";
import { startRegistrationReminderJob } from "./jobs/registration.job";

const app = express();

startRentalReminderJob();
startRegistrationReminderJob();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  return res.status(200).json({ ok: true });
});
app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

app.use("/auth", authRoutes);

if (process.env.IFMA_MODE === "true") {
  app.use("/auth/ifma", ifmaRoutes);
  console.log("🏫 Modo IFMA ativado — rotas acadêmicas registradas.");
}

app.use("/games", gameRoutes);
app.use("/games", gameCopyRoutes);
app.use("/games", gameWatchRoutes);

app.use("/favorites", favoritesRoutes);
app.use("/rentals", rentalRoutes);
app.use("/admin/rentals", adminRentalRoutes);
app.use("/engagement", engagementRoutes);
app.use("/users", pushTokenRoutes);
app.use("/users", userProfileRoutes);
app.use("/categories", categoryRoutes);
app.use("/notifications", notificationRoutes);
app.use("/admin/users", adminUserRoutes);

app.get("/", (_req, res) => {
  res.send("API Ludus rodando 🚀");
});

app.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
});