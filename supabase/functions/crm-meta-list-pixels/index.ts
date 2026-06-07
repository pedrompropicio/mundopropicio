// crm-meta-list-pixels
// POST { connection_id?: string, company_id?: string }
//
// Lista pixels (adspixels) da ad account associada à conexão Meta indicada.
// Reutiliza o token long-lived encriptado em crm.ad_platform_connections
// via RPC crm_get_meta_decrypted_token (master key na env ENCRYPTION_MASTER_KEY).
//
// Resposta: { ad_account_id, pixels: [{id, name, last_fired_time}], count }

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v23.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeAdAccountId(raw: string): string {
  const c = raw.trim();
  return c.startsWith("act_") ? c : `act_${c}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { connection_id?: string; company_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body.connection_id && !body.company_id) {
    return json({ error: "missing_params", detail: "connection_id ou company_id obrigatório" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve connection_id (directo ou via company_id → connexão Meta activa)
  let connectionId = body.connection_id ?? null;
  if (!connectionId && body.company_id) {
    const { data: connRow, error: connErr } = await supabase
      .schema("crm")
      .from("ad_platform_connections")
      .select("id")
      .eq("company_id", body.company_id)
      .eq("platform", "meta")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (connErr || !connRow) {
      return json({ error: "no_active_meta_connection", detail: connErr?.message }, 404);
    }
    connectionId = connRow.id;
  }

  // Obter selected_ad_account_id da conexão
  const { data: acctRow, error: acctErr } = await supabase
    .schema("crm")
    .from("ad_platform_connections")
    .select("selected_ad_account_id")
    .eq("id", connectionId!)
    .maybeSingle();
  if (acctErr || !acctRow?.selected_ad_account_id) {
    return json({ error: "no_selected_ad_account", detail: acctErr?.message }, 404);
  }
  const adAccountId = normalizeAdAccountId(acctRow.selected_ad_account_id);

  // Decifrar token via RPC SECURITY DEFINER
  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken } = tokenRows[0] as { access_token: string };

  // GET /act_X/adspixels?fields=id,name,last_fired_time&limit=200
  try {
    const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/adspixels`);
    u.searchParams.set("fields", "id,name,last_fired_time");
    u.searchParams.set("limit", "200");
    u.searchParams.set("access_token", accessToken);
    const r = await fetch(u.toString());
    const j = await r.json();
    if (!r.ok || j.error) {
      console.error("[crm-meta-list-pixels] graph err:", r.status, j.error);
      return json({ error: "graph_api_error", message: j.error?.message ?? `HTTP ${r.status}` }, 502);
    }
    const pixels = (j.data ?? []).map((p: any) => ({
      id: String(p.id),
      name: p.name ?? null,
      last_fired_time: p.last_fired_time ?? null,
    }));
    return json({
      ad_account_id: adAccountId,
      pixels,
      count: pixels.length,
    });
  } catch (e) {
    console.error("[crm-meta-list-pixels] fetch threw:", e);
    return json({ error: "graph_api_unreachable", detail: String(e) }, 502);
  }
});
