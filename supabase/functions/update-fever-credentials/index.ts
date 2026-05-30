// update-fever-credentials
// Helper para a UI escrever/atualizar credenciais Fever no Vault.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface Body { configId: string; username: string; password: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Autenticar caller (precisa de admin/manager/editor/platform_admin)
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const uid = userData.user.id;

  let body: Body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const { configId, username, password } = body;
  if (!configId || !username || !password) {
    return new Response(JSON.stringify({ error: "configId, username, password required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Verificar role
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
  const allowed = (roles || []).some((r: any) => ["admin", "manager", "editor", "platform_admin"].includes(r.role));
  if (!allowed) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Carregar config
  const { data: cfg } = await admin.from("fever_sync_config").select("vault_secret_name").eq("id", configId).single();
  if (!cfg) return new Response(JSON.stringify({ error: "config not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const secretValue = JSON.stringify({ username, password });
  const secretName = cfg.vault_secret_name;

  // Usar upsert_vault_secret (mesma RPC que refresh-fever-token usa com sucesso).
  // Trata create+update num só. Evita falha por unique violation quando o segredo já existe.
  const { error: vaultErr } = await admin.rpc("upsert_vault_secret" as any, {
    _name: secretName,
    _value: secretValue,
    _description: `Fever credentials (config ${configId}, updated ${new Date().toISOString()})`,
  });

  if (vaultErr) {
    console.log(`[update-fever-credentials] upsert_vault_secret failed: ${vaultErr.message}`);
    return new Response(JSON.stringify({ error: `vault: ${vaultErr.message}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[update-fever-credentials] OK config=${configId} secret=${secretName}`);
  return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
