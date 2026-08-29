import cron from "node-cron";
import { prisma } from "../lib/prisma";

export function startSeasonJob() {

  cron.schedule("1 0 * * *", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

  
    const startingSeason = await prisma.season.findFirst({
      where: {
        startDate: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    if (startingSeason) {
      console.log(`[SEASON] Iniciando nova temporada: ${startingSeason.name}. Zerando pontos...`);
      
     
      await prisma.user.updateMany({
        where: { role: "USER" },
        data: {
          points: 0,
          level: 1,
        },
      });
      
      console.log("[SEASON] Pontos e Níveis zerados com sucesso para a nova corrida!");
    }
  });
}