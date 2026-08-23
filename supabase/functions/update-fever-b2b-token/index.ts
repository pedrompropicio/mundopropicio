// update-fever-b2b-token
// Guarda no Vault o B2bToken Fever (JWT) usado pela edge fetch-fever-reports.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface Body { configId: string; token: string }

function decodeJwtPayload(jwt: string): any {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("JWT inválido (≠3 segmentos)");
  let p = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  while (p.length % 4) p += "=";
  return JSON.parse(atob(p));
}

const json = (status: number, body: any) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json(401, { error: "unauthorized" });

  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "invalid token" });
  const uid = userData.user.id;

  let body: Body;
  try { body = await req.json(); } catch { return json(400, { error: "invalid json" }); }
  const { configId, token: b2bToken } = body;
  if (!configId || !b2bToken) return json(400, { error: "configId, token required" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
  const allowed = (roles || []).some((r: any) => ["admin", "manager", "editor", "platform_admin"].includes(r.role));
  if (!allowed) return json(403, { error: "forbidden" });

  // Validar JWT
  let payload: any;
  try { payload = decodeJwtPayload(b2bToken.trim()); } catch (e: any) {
    return json(400, { error: `Token inválido: ${e?.message || e}` });
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload?.exp || typeof payload.exp !== "number") return json(400, { error: "Token sem exp." });
  if (payload.exp <= now) return json(400, { error: `Token já expirou em ${new Date(payload.exp * 1000).toISOString()}` });

  // Carregar config
  const { data: cfg } = await admin.from("fever_sync_config")
    .select("b2b_token_secret_name").eq("id", configId).single();
  if (!cfg) return json(404, { error: "config not found" });
  if (!cfg.b2b_token_secret_name) return json(400, { error: "b2b_token_secret_name vazio no config (corre a migration)" });

  const secretName = cfg.b2b_token_secret_name;
  const secretValue = b2bToken.trim();

  // Upsert atómico no Vault (RPC criada para resolver bug do SDK não aceder schema vault)
  const { error: vaultErr } = await admin.rpc("upsert_vault_secret" as any, {
    _name: secretName,
    _value: secretValue,
    _description: `Fever B2bToken (config ${configId})`,
  });
  if (vaultErr) return json(500, { error: `vault: ${vaultErr.message}` });

  const hoursRemaining = Math.round(((payload.exp - now) / 3600) * 10) / 10;
  return json(200, { ok: true, exp: payload.exp, hoursRemaining, user_email: payload.user_email || null });
});
