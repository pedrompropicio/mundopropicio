// capi-v2-send (#322 opção A) — remetente CAPI v2 por prova de consentimento.
// Chamável só com service_role (verify_jwt = true + verificação em código).
// Ações: health | dry_run | send. "send" recusa com capi_dispatch_allowed()=false
// (suspensão #320), salvo override explícito de teste autorizado pelo Pedro.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "./handler.ts";
import { isServiceRoleRequest } from "../_shared/multiTenant.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const handle = createHandler({
  sb: createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as any,
  fetchFn: fetch,
  env: (k) => Deno.env.get(k),
  now: () => new Date(),
  isServiceRole: isServiceRoleRequest,
});

Deno.serve(handle);
