// update-ticketline-credentials
// Helper para a UI escrever/atualizar credenciais Ticketline ({email,password}) no Vault.
// Espelha update-fever-credentials.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface Body { configId: string; email: string; password: string }

const json = (status: number, body: any) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "unauthorized" });

  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "invalid token" });
  const uid = userData.user.id;

  let body: Body;
  try { body = await req.json(); } catch { return json(400, { error: "invalid json" }); }
  const { configId, email, password } = body;
  if (!configId || !email || !password) return json(400, { error: "configId, email, password required" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
  const allowed = (roles || []).some((r: any) => ["admin", "manager", "editor", "platform_admin"].includes(r.role));
  if (!allowed) return json(403, { error: "forbidden" });

  const { data: cfg } = await admin.from("ticketline_sync_config").select("vault_secret_name").eq("id", configId).single();
  if (!cfg) return json(404, { error: "config not found" });

  const secretValue = JSON.stringify({ email, password });
  const secretName = cfg.vault_secret_name;

  const { data: existing } = await admin.from("vault.secrets" as any).select("id").eq("name", secretName).maybeSingle();
  let vaultErr: any = null;
  if (existing?.id) {
    const { error } = await admin.rpc("update_vault_secret" as any, { _id: existing.id, _value: secretValue });
    vaultErr = error;
  } else {
    const { error } = await admin.rpc("create_vault_secret" as any, { _name: secretName, _value: secretValue, _description: `Ticketline credentials (config ${configId})` });
    vaultErr = error;
  }
  if (vaultErr) return json(500, { error: `vault: ${vaultErr.message}` });
  return json(200, { ok: true });
});
