import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment:"node", include:["docs/testes/issue333/compatibility.test.ts"] } });