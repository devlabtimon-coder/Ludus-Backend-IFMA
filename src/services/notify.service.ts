import { prisma } from "../lib/prisma";
import { Expo } from "expo-server-sdk";

const expo = new Expo();

type NotifyParams = {
  userId: string;
  type: any; 
  title: string;
  body: string;
  data?: any;
  channelId?: "rentals" | "system" | "default";
  dedupeKey?: string; 
}

export async function notifyUser(p: NotifyParams) {
  
  if (p.dedupeKey) {
    const exists = await prisma.notification.findFirst({
      where: { dedupeKey: p.dedupeKey, userId: p.userId },
      select: { id: true },
    });
    if (exists) return;
  }

  await prisma.notification.create({
    data: {
      userId: p.userId,
      type: p.type,
      title: p.title,
      body: p.body,
      data: p.data ?? {},
      dedupeKey: p.dedupeKey ?? null,
    },
  });

  const tokens = await prisma.pushToken.findMany({
    where: { userId: p.userId },
    select: { expoPushToken: true },
  });

  // 🔍 LOG 1: Mostra quais tokens foram encontrados no banco para este usuário
  console.log(`[PUSH DEBUG] Tokens encontrados para o usuário ${p.userId}:`, tokens);

  const messages = tokens
    .map((t) => t.expoPushToken)
    .filter((token) => Expo.isExpoPushToken(token))
    .map((token) => ({
      to: token,
      sound: "default" as const,
      title: p.title,
      body: p.body,
      data: p.data ?? {},
      channelId: p.channelId ?? "default",
    }));

  if (messages.length === 0) {
    console.log(`[PUSH DEBUG] Nenhum token válido encontrado para o usuário ${p.userId}. O push foi abortado.`);
    return;
  }

  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      // 🔍 LOG 2: Confirma que o Expo recebeu e gerou os tickets
      console.log("[PUSH DEBUG] Tickets do Expo enviados com sucesso:", tickets);
    } catch (e) {
      console.error("[PUSH ERROR] Erro ao enviar para o Expo:", e);
    }
  }
}