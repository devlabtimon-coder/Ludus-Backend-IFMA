import cron from "node-cron";
import { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { notifyUser } from "../services/notify.service";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function gen6() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function startRegistrationReminderJob() {
  // Roda todos os dias às 10:00 da manhã
  // Você pode alterar o cron "0 10 * * *" para a frequência que desejar
  cron.schedule("0 10 * * *", async () => {
    const now = new Date();

    // ========================================================
    // 1. LEMBRETE PUSH: Contas criadas que faltam etapas (Telefone / SUAP)
    // ========================================================
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const incompleteUsers = await prisma.user.findMany({
      where: {
        OR: [
          { phoneVerified: false },
          { isAcademicVerified: false } // Remove esta linha se IFMA mode estiver desativado no BD
        ],
        // Filtra os criados nos últimos 7 dias para não incomodar contas muito antigas e inativas
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
        body = "Você precisa verificar seu telefone para conseguir alugar jogos.";
        route = "/profile/account"; // Rota onde ele pode verificar o telefone
      } else if (user.isAcademicVerified === false) {
        title = "Verificação Acadêmica 🎓";
        body = "Falta pouco! Vincule sua conta do SUAP para comprovar seu vínculo.";
        route = "/suap-verify";
      }

      // Chave única para enviar apenas 1 notificação destas por dia por usuário
      const dateString = now.toISOString().split("T")[0];
      const dedupeKey = `REMIND_REGISTRATION_${user.id}_${dateString}`;

      await notifyUser({
        userId: user.id,
        type: "SYSTEM" as NotificationType, // Usa um tipo genérico ou crie um REGISTRATION_REMINDER no Prisma
        title,
        body,
        channelId: "system",
        data: { route },
        dedupeKey,
      });
    }

    // ========================================================
    // 2. LEMBRETE E-MAIL: Abandonou no meio da verificação de código
    // ========================================================
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const pendingRegs = await prisma.pendingRegistration.findMany({
      where: {
        // Pega registros com menos de 24h e mais de 2h
        createdAt: { gte: twentyFourHoursAgo, lte: twoHoursAgo },
        // Garante que não foi enviado nenhum email nas últimas 2 horas
        lastEmailSentAt: { lte: twoHoursAgo }
      }
    });

    for (const pending of pendingRegs) {
      const newCode = gen6();

      await prisma.pendingRegistration.update({
        where: { id: pending.id },
        data: {
          emailVerificationCode: newCode,
          emailCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // expira em 10 min
          lastEmailSentAt: new Date(),
        }
      });

      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM!,
          to: [pending.email],
          subject: "Você está quase lá! - Ludus 🎲",
          html: `
            <div style="font-family: Arial, sans-serif;">
              <h2>Falta muito pouco, ${pending.name}!</h2>
              <p>Vimos que você começou a criar uma conta na Ludus, mas não finalizou.</p>
              <p>Volte no aplicativo e utilize o código abaixo para concluir seu cadastro:</p>
              <div style="font-size: 28px; letter-spacing: 6px; font-weight: 700; color: #31358B;">
                ${newCode}
              </div>
              <p>Esse código expira em 10 minutos. Te esperamos por lá!</p>
            </div>
          `,
        });
      } catch (e) {
        console.error("Falha ao enviar e-mail de lembrete de cadastro:", e);
      }
    }
  });
}