import { prisma } from "../lib/prisma";
import { NotificationType } from "@prisma/client";
import { sendPushToUser } from "./push.service";

interface AdminNotifyParams {
  title: string;
  body: string;
  data?: any;
  dedupeKey?: string;
}

export async function notifyAdmins({ title, body, data, dedupeKey }: AdminNotifyParams) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true }
  });

  for (const admin of admins) {
    const finalDedupeKey = dedupeKey ? `${dedupeKey}_${admin.id}` : undefined;

    if (finalDedupeKey) {
      const exists = await prisma.notification.findFirst({
        where: { dedupeKey: finalDedupeKey, userId: admin.id },
      });
      if (exists) continue;
    }

    await prisma.notification.create({
      data: {
        userId: admin.id,
        type: NotificationType.SYSTEM,
        title,
        body,
        data: data ?? {},
        dedupeKey: finalDedupeKey,
      },
    });

    try {
      await sendPushToUser({
        userId: admin.id,
        title,
        body,
        data,
        channelId: "system"
      });
    } catch (err) {
      console.error(`Erro ao enviar push para admin ${admin.id}`, err);
    }
  }
}