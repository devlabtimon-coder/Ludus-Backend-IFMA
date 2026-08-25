import cron from "node-cron";
import { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { notifyUser } from "../services/notify.service";
import { sendRegistrationReminderEmail } from "../services/email.service";

function gen6() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function startRegistrationReminderJob() {

  cron.schedule("0 10 * * *", async () => {
    const now = new Date();

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const incompleteUsers = await prisma.user.findMany({
      where: {
        OR: [
          { phoneVerified: false },
          { isAcademicVerified: false } 
        ],
       
        createdAt: {
          gte: sevenDaysAgo,
        }
      }
    });

    for (const user of incompleteUsers) {
      let title = "Falta pouco para começar! 🚀";
      let body = "Finalize seu cadastro para liberar os aluguéis de jogos.";
      let route = "/profile";

      if (!user.phoneVerified) {
        title = "Verifique seu número 📱";
        body = "Verifique seu número de telefone para deixar sua conta mais segura!";
        route = "/profile/account"; 
      } else if (user.isAcademicVerified === false) {
        title = "Verificação Acadêmica 🎓";
        body = "Falta pouco! Vincule sua conta do SUAP para comprovar seu vínculo.";
        route = "/suap-verify";
      }

     
      const dateString = now.toISOString().split("T")[0];
      const dedupeKey = `REMIND_REGISTRATION_${user.id}_${dateString}`;

      await notifyUser({
        userId: user.id,
        type: "SYSTEM" as NotificationType, 
        title,
        body,
        channelId: "system",
        data: { route },
        dedupeKey,
      });
    }

    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const pendingRegs = await prisma.pendingRegistration.findMany({
      where: {
        
        createdAt: { gte: twentyFourHoursAgo, lte: twoHoursAgo },
   
        lastEmailSentAt: { lte: twoHoursAgo }
      }
    });

    for (const pending of pendingRegs) {
      const newCode = gen6();

      await prisma.pendingRegistration.update({
        where: { id: pending.id },
        data: {
          emailVerificationCode: newCode,
          emailCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000), 
          lastEmailSentAt: new Date(),
        }
      });

      await sendRegistrationReminderEmail(pending.email, pending.name, newCode);
    }
  });
}