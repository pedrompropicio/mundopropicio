// cold-start trigger: 2026-06-01-v2 secret rotation
// crm-meta-deployment-toggle
// POST { deployment_id, target_status: 'ACTIVE' | 'PAUSED' }
// Para cada campaign/adset/ad do deployment, faz POST ao Meta para mudar o status.
// Atualiza current_status e regista no toggle_log.

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function metaPost(path: string, accessToken: string, params: Record<string, string>): Promise<any> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${path}`;
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const r = await fetch(url, { method: "POST", body });
  const j = await r.json();
  if (!r.ok || j.error) {
    const err = j.error?.message || JSON.stringify(j);
    throw new Error(`Meta API ${r.status}: ${err}`);
  }
  return j;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { deployment_id?: string; target_status?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { deployment_id, target_status } = body;
  if (!deployment_id) return json({ error: "missing_deployment_id" }, 400);
  if (target_status !== "ACTIVE" && target_status !== "PAUSED") {
    return json({ error: "invalid_target_status", message: "target_status deve ser ACTIVE ou PAUSED" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized", detail: userErr?.message }, 401);
  const userId = userData.user.id;

  const { data: dep, error: depErr } = await (supabase as any)
    .schema("crm").from("meta_campaign_strategy_deployments")
    .select("id, connection_id, meta_campaign_ids, meta_adset_ids, meta_ad_ids, current_status")
    .eq("id", deployment_id)
    .maybeSingle();
  if (depErr || !dep) return json({ error: "deployment_not_found", detail: depErr?.message }, 404);
  if (!dep.connection_id) return json({ error: "no_connection" }, 400);

  const { data: tokenRows, error: tokenErr } = await supabase.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: dep.connection_id,
    p_master_key: ENCRYPTION_MASTER_KEY,
  });
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "token_failed", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken } = tokenRows[0] as { access_token: string };

  const campaigns = Array.isArray(dep.meta_campaign_ids) ? dep.meta_campaign_ids : [];
  const adsets = Array.isArray(dep.meta_adset_ids) ? dep.meta_adset_ids : [];
  const ads = Array.isArray(dep.meta_ad_ids) ? dep.meta_ad_ids : [];

  if (campaigns.length === 0 && adsets.length === 0 && ads.length === 0) {
    return json({ error: "nothing_to_toggle" }, 400);
  }

  const log: any[] = [];
  let successCount = 0;
  let errorCount = 0;

  const order = target_status === "ACTIVE"
    ? [...campaigns.map((c: any) => ({ id: c.meta_campaign_id, type: "campaign" })),
       ...adsets.map((a: any) => ({ id: a.meta_adset_id, type: "adset" })),
       ...ads.map((a: any) => ({ id: a.meta_ad_id, type: "ad" }))]
    : [...ads.map((a: any) => ({ id: a.meta_ad_id, type: "ad" })),
       ...adsets.map((a: any) => ({ id: a.meta_adset_id, type: "adset" })),
       ...campaigns.map((c: any) => ({ id: c.meta_campaign_id, type: "campaign" }))];

  for (const item of order) {
    if (!item.id) continue;
    try {
      await metaPost(item.id, accessToken, { status: target_status });
      successCount++;
      log.push({ ts: new Date().toISOString(), level: "info", type: item.type, meta_id: item.id, target: target_status });
    } catch (e: any) {
      errorCount++;
      log.push({ ts: new Date().toISOString(), level: "error", type: item.type, meta_id: item.id, error: e.message?.slice(0, 200) });
    }
  }

  const newStatus = errorCount === 0
    ? (target_status === "ACTIVE" ? "active" : "paused")
    : "mixed";

  const toggleEntry = {
    ts: new Date().toISOString(),
    user_id: userId,
    target_status,
    success: successCount,
    errors: errorCount,
    details: log.slice(0, 50),
  };

  const { data: current } = await (supabase as any)
    .schema("crm").from("meta_campaign_strategy_deployments")
    .select("toggle_log")
    .eq("id", deployment_id)
    .maybeSingle();
  const existingLog = Array.isArray(current?.toggle_log) ? current.toggle_log : [];
  const updatedLog = [toggleEntry, ...existingLog].slice(0, 20);

  await (supabase as any).schema("crm").from("meta_campaign_strategy_deployments").update({
    current_status: newStatus,
    last_toggled_at: new Date().toISOString(),
    toggle_log: updatedLog,
  }).eq("id", deployment_id);

  return json({
    deployment_id,
    new_status: newStatus,
    target_status,
    summary: {
      success: successCount,
      errors: errorCount,
      total: successCount + errorCount,
    },
    log,
  });
});
