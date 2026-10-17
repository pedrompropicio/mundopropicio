import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({ plugins:[react()],resolve:{alias:{"@":path.resolve("src"),"@shared":path.resolve("supabase/functions/_shared"),"npm:@supabase/supabase-js@2":"@supabase/supabase-js","npm:zod@3.23.8":"zod"}},test:{globals:true,environment:"jsdom",setupFiles:["src/test/setup.ts"],include:["docs/testes/issue333/integrated/*.test.ts*"],testTimeout:30000}});
