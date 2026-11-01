import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["supabase/functions/generate-accountant-zip/*.test.ts"],
  },
});