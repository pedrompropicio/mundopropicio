import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "npm:@supabase/supabase-js@2/cors": "@supabase/supabase-js/cors",
      "npm:@supabase/supabase-js@2": "@supabase/supabase-js",
      "npm:jszip@3.10.1": "jszip",
      "npm:zod@3": "zod",
    },
  },
  test: {
    environment: "node",
    include: ["supabase/functions/generate-accountant-zip/*.test.ts"],
  },
});