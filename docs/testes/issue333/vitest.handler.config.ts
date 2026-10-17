import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "npm:zod@3": "zod" } },
  test: { environment: "node", include: ["docs/testes/issue333/handler/*.test.ts"], testTimeout: 30000 },
});
