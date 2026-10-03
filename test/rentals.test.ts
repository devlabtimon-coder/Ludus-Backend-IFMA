import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authHeader, buildApp } from "./helpers/app";
import { createCopy, createGame, createRental, createUser, prisma, resetDatabase } from "./helpers/db";

const app = buildApp();

// Segunda-feira, 05/10/2026, 08:00 em São Paulo.
const NOW = new Date("2026-10-05T11:00:00Z");
// Terça-feira, 10:00 às 14:00 em São Paulo.
const TUE_10H = "2026-10-06T13:00:00.000Z";
const TUE_14H = "2026-10-06T17:00:00.000Z";

async function eventually(check: () => Promise<void>, timeoutMs = 2000) {
  const start = Date.now();
  for (;;) {
    try {
      return await check();
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

async function setupGame(copies = 1) {
  const admin = await createUser({ role: "ADMIN" });
  const game = await createGame(admin.id);
  const copyList = [];
  for (let n = 1; n <= copies; n++) copyList.push(await createCopy(game.id, n));
  return { admin, game, copies: copyList };
}

beforeEach(async () => {
  await resetDatabase();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /rentals", () => {
  it("cria a reserva pendente e reserva um exemplar livre", async () => {
    const { game, copies } = await setupGame();
    const user = await createUser();

    const res = await request(app)
      .post("/rentals")
      .set(authHeader(user))
      .send({ gameId: game.id, startDateIso: TUE_10H, endDateIso: TUE_14H });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "PENDING", userId: user.id, copyId: copies[0].id });
  });

  it("recusa quando o único exemplar já está reservado no horário", async () => {
    const { game } = await setupGame();
    const first = await createUser();
    const second = await createUser();

    await request(app).post("/rentals").set(authHeader(first))
      .send({ gameId: game.id, startDateIso: TUE_10H, endDateIso: TUE_14H });
    const res = await request(app).post("/rentals").set(authHeader(second))
      .send({ gameId: game.id, startDateIso: TUE_10H, endDateIso: TUE_14H });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TIME_SLOT_TAKEN");
  });

  it("limita a 2 aluguéis em aberto por usuário", async () => {
    const { game } = await setupGame(3);
    const user = await createUser();
    const send = () =>
      request(app).post("/rentals").set(authHeader(user))
        .send({ gameId: game.id, startDateIso: TUE_10H, endDateIso: TUE_14H });

    expect((await send()).status).toBe(201);
    expect((await send()).status).toBe(201);
    const third = await send();

    expect(third.status).toBe(409);
    expect(third.body.code).toBe("RENTAL_LIMIT_REACHED");
  });

  it.each([
    ["no passado", "2026-10-02T13:00:00.000Z", "2026-10-02T17:00:00.000Z"],
    ["no fim de semana", "2026-10-10T13:00:00.000Z", "2026-10-10T17:00:00.000Z"],
    ["fora do horário", "2026-10-06T09:00:00.000Z", "2026-10-06T17:00:00.000Z"],
    ["com devolução antes da retirada", TUE_14H, TUE_10H],
  ])("recusa reserva %s", async (_label, startDateIso, endDateIso) => {
    const { game } = await setupGame();
    const user = await createUser();

    const res = await request(app).post("/rentals").set(authHeader(user))
      .send({ gameId: game.id, startDateIso, endDateIso });

    expect(res.status).toBe(400);
  });

  it("recusa conta com cadastro não aprovado", async () => {
    const { game } = await setupGame();
    const user = await createUser({ registrationStatus: "PENDING" });

    const res = await request(app).post("/rentals").set(authHeader(user))
      .send({ gameId: game.id, startDateIso: TUE_10H, endDateIso: TUE_14H });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_PENDING");
  });

  it("recusa jogo acima da categoria do cliente", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const game = await createGame(admin.id, { tier: "DIAMANTE" });
    await createCopy(game.id);
    const user = await createUser({ clientCategory: "FAMILY" });

    const res = await request(app).post("/rentals").set(authHeader(user))
      .send({ gameId: game.id, startDateIso: TUE_10H, endDateIso: TUE_14H });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("TIER_ACCESS_DENIED");
  });

  it("não permite que admins façam reservas", async () => {
    const { admin, game } = await setupGame();

    const res = await request(app).post("/rentals").set(authHeader(admin))
      .send({ gameId: game.id, startDateIso: TUE_10H, endDateIso: TUE_14H });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ADMIN_ACTION_BLOCKED");
  });

  it("exige autenticação", async () => {
    const res = await request(app).post("/rentals").send({});
    expect(res.status).toBe(401);
  });
});

describe("GET /rentals/me", () => {
  it("lista apenas os aluguéis do próprio usuário", async () => {
    const { game, copies } = await setupGame();
    const user = await createUser();
    const other = await createUser();
    await createRental({ userId: user.id, gameId: game.id, copyId: copies[0].id, startDate: new Date(TUE_10H), endDate: new Date(TUE_14H) });
    await createRental({ userId: other.id, gameId: game.id, copyId: copies[0].id, startDate: new Date(TUE_10H), endDate: new Date(TUE_14H) });

    const res = await request(app).get("/rentals/me").set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].userId).toBe(user.id);
  });
});

describe("PATCH /rentals/:id/cancel", () => {
  it("cancela a própria reserva pendente e aplica -2 pontos", async () => {
    const { game } = await setupGame();
    const user = await createUser({ points: 10 });
    const rental = await createRental({ userId: user.id, gameId: game.id, startDate: new Date(TUE_10H), endDate: new Date(TUE_14H) });

    const res = await request(app).patch(`/rentals/${rental.id}/cancel`).set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELED");
    await eventually(async () => {
      const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(fresh.points).toBe(8);
    });
  });

  it("não deixa cancelar a reserva de outro usuário", async () => {
    const { game } = await setupGame();
    const owner = await createUser();
    const intruder = await createUser();
    const rental = await createRental({ userId: owner.id, gameId: game.id, startDate: new Date(TUE_10H), endDate: new Date(TUE_14H) });

    const res = await request(app).patch(`/rentals/${rental.id}/cancel`).set(authHeader(intruder));

    expect(res.status).toBe(404);
  });

  it("só cancela reservas pendentes", async () => {
    const { game } = await setupGame();
    const user = await createUser();
    const rental = await createRental({ userId: user.id, gameId: game.id, startDate: new Date(TUE_10H), endDate: new Date(TUE_14H), status: "ACTIVE" });

    const res = await request(app).patch(`/rentals/${rental.id}/cancel`).set(authHeader(user));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ONLY_PENDING_CAN_CANCEL");
  });
});

describe("disponibilidade", () => {
  it("lista os horários livres do dia e remove os ocupados", async () => {
    const { game, copies } = await setupGame();
    const user = await createUser();
    await createRental({ userId: user.id, gameId: game.id, copyId: copies[0].id, startDate: new Date(TUE_10H), endDate: new Date(TUE_14H) });

    const res = await request(app).get(`/rentals/game/${game.id}/availability?date=2026-10-06`).set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body.availableSlots).toContain("08:00");
    expect(res.body.availableSlots).not.toContain("10:00");
    expect(res.body.availableSlots).not.toContain("14:00"); // folga de 30 min após a devolução
    expect(res.body.availableSlots).toContain("14:30");
  });

  it("marca o mês inteiro como indisponível quando o jogo não tem exemplares", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const game = await createGame(admin.id);
    const user = await createUser();

    const res = await request(app).get(`/rentals/game/${game.id}/unavailable-dates?year=2026&month=10`).set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body.unavailableDates).toEqual(["ALL"]);
  });
});

describe("GET /admin/rentals", () => {
  it("lista paginado para admins e bloqueia usuários comuns", async () => {
    const { admin, game } = await setupGame();
    const user = await createUser();
    await createRental({ userId: user.id, gameId: game.id, startDate: new Date(TUE_10H), endDate: new Date(TUE_14H) });

    const asAdmin = await request(app).get("/admin/rentals").set(authHeader(admin));
    const asUser = await request(app).get("/admin/rentals").set(authHeader(user));

    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body).toMatchObject({ total: 1, page: 1, totalPages: 1 });
    expect(asAdmin.body.data).toHaveLength(1);
    expect(asUser.status).toBe(403);
  });
});

describe("PATCH /admin/rentals/:id/status", () => {
  it("recusa ativar muito antes do horário de retirada", async () => {
    const { admin, game } = await setupGame();
    const user = await createUser();
    const rental = await createRental({ userId: user.id, gameId: game.id, startDate: new Date(TUE_10H), endDate: new Date(TUE_14H) });

    const res = await request(app).patch(`/admin/rentals/${rental.id}/status`).set(authHeader(admin)).send({ status: "ACTIVE" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("TOO_EARLY_TO_ACTIVATE");
  });

  it("ativa no horário: +5 pontos e conta o aluguel", async () => {
    const { admin, game } = await setupGame();
    const user = await createUser();
    const rental = await createRental({ userId: user.id, gameId: game.id, startDate: new Date(TUE_10H), endDate: new Date(TUE_14H) });
    vi.setSystemTime(new Date(TUE_10H));

    const res = await request(app).patch(`/admin/rentals/${rental.id}/status`).set(authHeader(admin)).send({ status: "ACTIVE" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACTIVE");
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(fresh.points).toBe(5);
    expect(fresh.totalRentalsCount).toBe(1);
  });

  it("devolução no prazo dá +5 pontos", async () => {
    const { admin, game } = await setupGame();
    const user = await createUser();
    const rental = await createRental({ userId: user.id, gameId: game.id, startDate: new Date(TUE_10H), endDate: new Date(TUE_14H), status: "ACTIVE" });
    vi.setSystemTime(new Date("2026-10-06T16:00:00Z"));

    const res = await request(app).patch(`/admin/rentals/${rental.id}/status`).set(authHeader(admin)).send({ status: "RETURNED" });

    expect(res.status).toBe(200);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(fresh.points).toBe(5);
  });

  it("devolução com avaria: -20 pontos e bloqueia o exemplar", async () => {
    const { admin, game, copies } = await setupGame();
    const user = await createUser({ points: 30 });
    const rental = await createRental({ userId: user.id, gameId: game.id, copyId: copies[0].id, startDate: new Date(TUE_10H), endDate: new Date(TUE_14H), status: "ACTIVE" });

    const res = await request(app).patch(`/admin/rentals/${rental.id}/status`).set(authHeader(admin))
      .send({ status: "RETURNED", applyPenalty: true, penaltyReason: "Faltando peças" });

    expect(res.status).toBe(200);
    const [freshUser, freshCopy] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      prisma.gameCopy.findUniqueOrThrow({ where: { id: copies[0].id } }),
    ]);
    expect(freshUser.points).toBe(10);
    expect(freshCopy.available).toBe(false);
  });

  it("não altera aluguel já finalizado", async () => {
    const { admin, game } = await setupGame();
    const user = await createUser();
    const rental = await createRental({ userId: user.id, gameId: game.id, startDate: new Date(TUE_10H), endDate: new Date(TUE_14H), status: "RETURNED" });

    const res = await request(app).patch(`/admin/rentals/${rental.id}/status`).set(authHeader(admin)).send({ status: "ACTIVE" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("RENTAL_FINALIZED");
  });
});
