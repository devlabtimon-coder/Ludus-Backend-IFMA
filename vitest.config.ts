import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:55432/ludus_test";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/helpers/globalSetup.ts"],
    setupFiles: ["test/helpers/mocks.ts"],
    // Os testes compartilham o mesmo banco, então rodam em sequência.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      TZ: "UTC",
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: "segredo-de-teste",
      IFMA_MODE: "false",
    },
  },
});
