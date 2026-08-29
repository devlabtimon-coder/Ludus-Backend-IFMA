import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";

export const pushTokenRoutes = Router();

pushTokenRoutes.post("/me/push-token", ensureAuthenticated, async (req, res) => {
  const { expoPushToken } = req.body;

  if (!expoPushToken) {
    return res.status(400).json({ error: "Token do Expo é obrigatório" });
  }

  try {
    
    await prisma.pushToken.deleteMany({
      where: { userId: req.user.id }
    });


    await prisma.pushToken.create({
      data: {
        expoPushToken,
        userId: req.user.id,
      },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao registrar push token:", err);
    return res.status(500).json({ error: "Erro ao registrar token" });
  }
});