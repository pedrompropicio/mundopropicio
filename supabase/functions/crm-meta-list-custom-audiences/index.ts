// cold-start trigger: 2026-06-01-v2 secret rotation
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

  let body: { connection_id?: string; ad_account_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const connectionId = body.connection_id;
  const rawAcct = body.ad_account_id;
  if (!connectionId || !rawAcct) return json({ error: "missing_params" }, 400);
  const adAccountId = normalizeAdAccountId(rawAcct);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenRows, error: tokenErr } = await supabase.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY,
  });
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken } = tokenRows[0] as { access_token: string };

  let audiences: any[] = [];
  try {
    const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/customaudiences`);
    u.searchParams.set("fields", "id,name,description,subtype,approximate_count_lower_bound,approximate_count_upper_bound,is_value_based,time_created,operation_status,delivery_status");
    u.searchParams.set("limit", "100");
    u.searchParams.set("access_token", accessToken);
    const r = await fetch(u);
    const j = await r.json();
    if (!r.ok || j.error) {
      console.error("[list-custom-audiences] err:", r.status, j.error);
      return json({ error: "graph_api_error", message: j.error?.message ?? `HTTP ${r.status}` }, 502);
    }
    audiences = j.data ?? [];
  } catch (e) {
    console.error("[list-custom-audiences] threw:", e);
    return json({ error: "graph_api_unreachable" }, 502);
  }

  return json({ audiences, count: audiences.length, fetched_at: new Date().toISOString() });
});
