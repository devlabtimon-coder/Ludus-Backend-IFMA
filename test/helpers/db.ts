import { ClientCategory, GameTier, RentalStatus } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";

export { prisma };

// Limpa todas as tabelas (menos o controle de migrations) entre os testes.
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

let seq = 0;

export async function createUser(overrides: Partial<{
  role: string;
  clientCategory: ClientCategory;
  registrationStatus: "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";
  points: number;
}> = {}) {
  seq++;
  return prisma.user.create({
    data: {
      name: `Aluno ${seq}`,
      email: `aluno${seq}@acad.ifma.edu.br`,
      emailVerified: true,
      role: overrides.role ?? "USER",
      clientCategory: overrides.clientCategory ?? "FAMILY",
      registrationStatus: overrides.registrationStatus ?? "APPROVED",
      points: overrides.points ?? 0,
    },
  });
}

export async function createGame(ownerId: string, overrides: Partial<{
  tier: GameTier;
  allowOriginalRental: boolean;
  available: boolean;
}> = {}) {
  seq++;
  return prisma.game.create({
    data: {
      title: `Jogo ${seq}`,
      price: 10,
      userId: ownerId,
      tier: overrides.tier ?? "BRONZE",
      allowOriginalRental: overrides.allowOriginalRental ?? false,
      available: overrides.available ?? true,
    },
  });
}

export async function createCopy(gameId: string, number = 1) {
  return prisma.gameCopy.create({
    data: { gameId, number, code: `CP-${number}`, available: true },
  });
}

export async function createRental(data: {
  userId: string;
  gameId: string;
  copyId?: string | null;
  startDate: Date;
  endDate: Date;
  status?: RentalStatus;
}) {
  return prisma.rental.create({
    data: {
      userId: data.userId,
      gameId: data.gameId,
      copyId: data.copyId ?? null,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status ?? "PENDING",
      gameTitleSnapshot: "Jogo",
    },
  });
}
