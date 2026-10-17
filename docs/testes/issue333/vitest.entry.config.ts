import {defineConfig} from 'vitest/config';
import path from 'node:path';
export default defineConfig({resolve:{alias:{'@':path.resolve('src'),'npm:@supabase/supabase-js@2/cors':'@supabase/supabase-js/cors','npm:@supabase/supabase-js@2':'@supabase/supabase-js','npm:zod@3.23.8':'zod'}},test:{environment:'node',include:['docs/testes/issue333/integrated/attempt-entry.test.ts'],testTimeout:30000}});
