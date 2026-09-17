import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import * as admin from "firebase-admin";
import { cert } from "firebase-admin/app";
import { globalLimiter } from "./middlewares/rateLimiter";

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
import { adminReportRoutes } from "./routes/adminReport.routes";
import ifmaRoutes from "./routes/ifma.routes";
import { adminUserRoutes } from "./routes/adminUser.routes";
import { startRegistrationReminderJob } from "./jobs/registration.job";
import { startSeasonJob } from "./jobs/season.job";
import { mechanicRoutes } from './routes/mechanic.routes';
import { seasonRoutes } from "./routes/season.routes";
import { maintenanceRoutes } from "./routes/maintenance.routes";
import { adminLogRoutes } from "./routes/adminLog.routes";

if (!process.env.JWT_SECRET) {
  process.exit(1);
}

const credentialsBase64 = process.env.FIREBASE_CREDENTIALS_BASE64;
if (credentialsBase64) {
  const serviceAccountJson = Buffer.from(credentialsBase64, "base64").toString("utf-8");
  const serviceAccount = JSON.parse(serviceAccountJson);
  admin.initializeApp({
    credential: cert(serviceAccount),
  });
}

const app = express();

app.set("trust proxy", 1);

if (process.env.RUN_CRONS === "true" || process.env.NODE_ENV !== "production") {
  startRentalReminderJob();
  startRegistrationReminderJob();
  startSeasonJob();
}

app.use(helmet());

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(",") 
  : ["http://localhost:5173", "http://localhost:8081"];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("CORS_BLOCKED"));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(globalLimiter);

app.get("/health", (_req, res) => {
  return res.status(200).json({ ok: true });
});

app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

app.use("/auth", authRoutes);
if (process.env.IFMA_MODE === "true") {
  app.use("/auth/ifma", ifmaRoutes);
}

app.use("/games", gameRoutes);
app.use("/games", gameCopyRoutes);
app.use("/games", gameWatchRoutes);
app.use("/admin/maintenance", maintenanceRoutes);
app.use('/mechanics', mechanicRoutes);
app.use("/admin/reports", adminReportRoutes);
app.use("/favorites", favoritesRoutes);
app.use("/rentals", rentalRoutes);
app.use("/admin/rentals", adminRentalRoutes);
app.use("/engagement", engagementRoutes);
app.use("/users", pushTokenRoutes);
app.use("/users", userProfileRoutes);
app.use("/categories", categoryRoutes);
app.use("/admin/seasons", seasonRoutes);
app.use("/notifications", notificationRoutes);
app.use("/admin/users", adminUserRoutes);
app.use("/admin/logs", adminLogRoutes);

app.get("/", (_req, res) => {
  res.send("API Ludus rodando");
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err.name === 'PrismaClientKnownRequestError') {
    return res.status(400).json({ error: "Erro de banco de dados ou restrição violada." });
  }

  return res.status(500).json({ 
    error: "Erro interno no servidor.", 
    message: process.env.NODE_ENV !== 'production' ? err.message : undefined 
  });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", () => {});