// Grava/actualiza o segredo Vault com as credenciais BOL (produtores.bol.pt).
// Padrão da update-ticketline-credentials.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "missing authorization" });

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json(401, { error: "invalid token" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
  const ok = (roles || []).some((r: any) => ["admin", "manager", "platform_admin"].includes(r.role));
  if (!ok) return json(403, { error: "forbidden" });

  let body: { secretName?: string; email?: string; password?: string };
  try { body = await req.json(); } catch { return json(400, { error: "invalid json" }); }

  const secretName = (body.secretName || "bol_master").trim();
  const email = (body.email || "").trim();
  const password = body.password || "";
  if (!/^[a-z0-9_\-]{3,80}$/i.test(secretName)) return json(400, { error: "secretName inválido" });
  if (!email || !password) return json(400, { error: "email e password são obrigatórios" });

  const { error } = await admin.rpc("upsert_vault_secret" as any, {
    _name: secretName,
    _value: JSON.stringify({ email, password }),
    _description: "BOL credentials (produtores.bol.pt)",
  });
  if (error) return json(500, { error: error.message });

  return json(200, { ok: true, secretName });
});
