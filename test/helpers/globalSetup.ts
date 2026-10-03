import { execSync } from "node:child_process";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:55432/ludus_test";

// Trava de segurança: o setup recria o banco do zero, então só pode rodar
// contra um banco local cujo nome indique teste. Nunca contra produção.
function assertSafeTestDatabase(url: string) {
  const { hostname, pathname } = new URL(url);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(hostname);
  const isTestDb = /test/i.test(pathname);
  if (!isLocal || !isTestDb) {
    throw new Error(
      `Banco de teste recusado (${hostname}${pathname}): use um banco local com "test" no nome.`,
    );
  }
}

// Cria o schema a partir do schema.prisma. As migrations não reproduzem o
// schema atual (há tabelas criadas fora delas), por isso db push.
export default function setup() {
  assertSafeTestDatabase(TEST_DATABASE_URL);
  execSync("npx prisma db push --force-reset --skip-generate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
