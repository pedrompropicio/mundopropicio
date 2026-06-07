// crm-meta-audience-create: cria uma Custom Audience no Meta para uma row local
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v19.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const normalizeAct = (raw: string) => (raw.trim().startsWith("act_") ? raw.trim() : `act_${raw.trim()}`);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { audience_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.audience_id) return json({ error: "missing_audience_id" }, 400);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Carregar audience + connection link (RLS verifica permissão)
  const { data: aud, error: audErr } = await userClient
    .from("meta_custom_audiences")
    .select("id, name, description, connection_id, audience_id_meta, company_id")
    .eq("id", body.audience_id)
    .maybeSingle();
  if (audErr || !aud) return json({ error: "audience_not_found_or_forbidden", detail: audErr?.message }, 404);
  if (aud.audience_id_meta) return json({ error: "audience_already_linked", audience_id_meta: aud.audience_id_meta }, 409);

  // Buscar link da ad account
  const { data: link, error: linkErr } = await (userClient as any)
    .schema("crm")
    .from("ad_platform_account_links")
    .select("connection_id, ad_account_id")
    .eq("id", aud.connection_id)
    .maybeSingle();
  if (linkErr || !link) return json({ error: "connection_link_not_found", detail: linkErr?.message }, 404);

  // Token decifrado
  const { data: tokenRows, error: tokErr } = await userClient.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: link.connection_id, p_master_key: ENCRYPTION_MASTER_KEY,
  });
  if (tokErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "token_decrypt_failed", detail: tokErr?.message }, 403);
  }
  const accessToken = (tokenRows[0] as { access_token: string }).access_token;

  // Criar audience no Meta
  const acct = normalizeAct(link.ad_account_id);
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${acct}/customaudiences`;
  const params = new URLSearchParams({
    name: aud.name,
    subtype: "CUSTOM",
    customer_file_source: "USER_PROVIDED_ONLY",
    access_token: accessToken,
  });
  if (aud.description) params.set("description", aud.description);

  let metaJson: any;
  try {
    const r = await fetch(url, { method: "POST", body: params });
    metaJson = await r.json();
    if (!r.ok || metaJson.error) {
      return json({ error: "graph_api_error", status: r.status, meta_error: metaJson.error }, 502);
    }
  } catch (e) {
    return json({ error: "graph_api_unreachable", detail: String(e) }, 502);
  }

  const audienceIdMeta = metaJson.id as string;

  // Update via service role (bypassa RLS para garantir consistência)
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: upErr } = await admin
    .from("meta_custom_audiences")
    .update({ audience_id_meta: audienceIdMeta })
    .eq("id", aud.id);
  if (upErr) return json({ error: "db_update_failed", audience_id_meta: audienceIdMeta, detail: upErr.message }, 500);

  return json({ ok: true, audience_id_meta: audienceIdMeta });
});
