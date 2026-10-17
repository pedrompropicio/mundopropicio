import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["docs/testes/issue333/pg/*.test.ts"], testTimeout: 60000, hookTimeout: 60000, fileParallelism: false } });
