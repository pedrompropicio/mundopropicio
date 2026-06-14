// cold-start trigger: 2026-06-01-v2 secret rotation
// crm-meta-sync-campaigns
//
// POST { connection_id: string, ad_account_id: string }
// ad_account_id pode vir como 'act_XXX' ou só 'XXX' (normaliza para act_*).
//
// Fluxo:
// 1. Valida JWT (Authorization header) → cria client com user JWT (preserva RLS).
// 2. Decifra token Meta via RPC SECURITY DEFINER crm_get_meta_decrypted_token.
// 3. GET Graph /act_<ID>/campaigns?fields=...
// 4. UPSERT para crm.meta_campaign_snapshot por (connection_id, external_campaign_id).
// 5. Devolve { synced_count, ad_account_id }.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeAdAccountId(raw: string): string {
  const cleaned = raw.trim();
  return cleaned.startsWith("act_") ? cleaned : `act_${cleaned}`;
}

function parseCents(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? parseInt(v, 10) : Number(v);
  return Number.isFinite(n) ? n : null;
}

interface GraphCampaign {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
  updated_time?: string;
  buying_type?: string;
  bid_strategy?: string;
}

interface GraphCampaignsResponse {
  data?: GraphCampaign[];
  paging?: { next?: string };
  error?: { message: string; type: string; code: number };
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[crm-meta-sync-campaigns] BUILD_VERSION=autolink-clearflag-v1", new Date().toISOString());
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { connection_id?: string; ad_account_id?: string; mode?: "incremental" | "full" };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const connectionId = body?.connection_id;
  const rawAdAccount = body?.ad_account_id;
  if (!connectionId || !rawAdAccount) {
    return json({ error: "missing_params" }, 400);
  }
  const adAccountId = normalizeAdAccountId(rawAdAccount);
  const mode: "incremental" | "full" = body?.mode === "full" ? "full" : "incremental";

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Decifrar token
  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    console.error("[crm-meta-sync-campaigns] decrypt failed:", tokenErr);
    return json(
      { error: "connection_not_found_or_unauthorised", detail: tokenErr?.message },
      403,
    );
  }
  const { access_token: accessToken, company_id: companyId } = tokenRows[0] as {
    access_token: string;
    company_id: string;
  };

  // 1.5) Read incremental cursor (last_sync_at) for this level
  let lastSyncAt: string | null = null;
  if (mode === "incremental") {
    const { data: stateRow } = await supabase
      .schema("crm")
      .from("meta_sync_state")
      .select("last_sync_at")
      .eq("company_id", companyId)
      .eq("connection_id", connectionId)
      .eq("ad_account_id", adAccountId)
      .eq("level", "campaigns")
      .maybeSingle();
    lastSyncAt = stateRow?.last_sync_at ?? null;
  }

  // 2) Fetch campaigns. Aplica filtering com effective_status + (incremental) updated_time>cursor.
  // Nota Meta Graph: `campaign.updated_time` é filtrável no endpoint /act_X/campaigns
  // (operator GREATER_THAN, value=unix-timestamp em segundos).
  let graphJson: GraphCampaignsResponse;
  try {
    const url = new URL(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/campaigns`,
    );
    url.searchParams.set(
      "fields",
      "id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time,created_time,updated_time,buying_type,bid_strategy",
    );
    url.searchParams.set("limit", "200");
    const filtering: any[] = [
      { field: "campaign.effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] },
    ];
    if (lastSyncAt) {
      filtering.push({
        field: "campaign.updated_time",
        operator: "GREATER_THAN",
        value: Math.floor(new Date(lastSyncAt).getTime() / 1000),
      });
    }
    url.searchParams.set("filtering", JSON.stringify(filtering));
    url.searchParams.set("access_token", accessToken);

    const res = await fetch(url);
    graphJson = (await res.json()) as GraphCampaignsResponse;
    if (!res.ok || graphJson.error) {
      console.error(
        "[crm-meta-sync-campaigns] graph error:",
        res.status,
        graphJson.error,
      );
      // Best-effort: regista erro
      await supabase.schema("crm").from("meta_sync_state").upsert({
        company_id: companyId, connection_id: connectionId, ad_account_id: adAccountId, level: "campaigns",
        last_error: graphJson.error?.message ?? `HTTP ${res.status}`,
        last_error_at: new Date().toISOString(),
      }, { onConflict: "company_id,connection_id,ad_account_id,level" });
      return json(
        {
          error: "graph_api_error",
          message: graphJson.error?.message ?? `HTTP ${res.status}`,
        },
        502,
      );
    }
  } catch (e) {
    console.error("[crm-meta-sync-campaigns] fetch threw:", e);
    return json({ error: "graph_api_unreachable" }, 502);
  }

  const campaigns = graphJson.data ?? [];

  // 2.5) Read currency from connection (default EUR)
  let currency = "EUR";
  const { data: connRow } = await supabase
    .schema("crm")
    .from("ad_platform_connections")
    .select("selected_ad_account_currency")
    .eq("id", connectionId)
    .maybeSingle();
  if (connRow?.selected_ad_account_currency) {
    currency = connRow.selected_ad_account_currency;
  }

  // 3) UPSERT em batch
  const rows = campaigns.map((c) => ({
    connection_id: connectionId,
    company_id: companyId,
    ad_account_id: adAccountId,
    currency,
    external_campaign_id: c.id,
    name: c.name ?? "(sem nome)",
    status: c.status ?? null,
    effective_status: c.effective_status ?? null,
    objective: c.objective ?? null,
    daily_budget_cents: parseCents(c.daily_budget),
    lifetime_budget_cents: parseCents(c.lifetime_budget),
    budget_remaining_cents: parseCents(c.budget_remaining),
    start_time: c.start_time ?? null,
    stop_time: c.stop_time ?? null,
    created_time: c.created_time ?? null,
    updated_time: c.updated_time ?? null,
    buying_type: c.buying_type ?? null,
    bid_strategy: c.bid_strategy ?? null,
    raw: c,
    last_synced_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error: upsertErr } = await supabase
      .schema("crm")
      .from("meta_campaign_snapshot")
      .upsert(rows, { onConflict: "connection_id,external_campaign_id" });

    if (upsertErr) {
      console.error("[crm-meta-sync-campaigns] upsert failed:", upsertErr);
      await supabase.schema("crm").from("meta_sync_state").upsert({
        company_id: companyId, connection_id: connectionId, ad_account_id: adAccountId, level: "campaigns",
        last_error: upsertErr.message, last_error_at: new Date().toISOString(),
      }, { onConflict: "company_id,connection_id,ad_account_id,level" });
      return json(
        { error: "persist_failed", detail: upsertErr.message },
        500,
      );
    }
  }

  // 3.5) Update sync state cursor
  const nowIso = new Date().toISOString();
  const stateRow: Record<string, unknown> = {
    company_id: companyId,
    connection_id: connectionId,
    ad_account_id: adAccountId,
    level: "campaigns",
    last_sync_at: nowIso,
    last_synced_rows_count: rows.length,
    last_error: null,
    last_error_at: null,
  };
  if (mode === "full") stateRow.last_full_sync_at = nowIso;
  await supabase.schema("crm").from("meta_sync_state").upsert(stateRow, {
    onConflict: "company_id,connection_id,ad_account_id,level",
  });

  // 4) Auto-link campaigns to active events (best-effort, do not block)
  let autoLinkedCount = 0;
  try {
    const { data: linkData, error: linkErr } = await supabase.rpc(
      "crm_auto_link_meta_campaigns_to_events",
      { p_company_id: companyId },
    );
    if (linkErr) {
      console.error("[crm-meta-sync-campaigns] auto-link failed:", linkErr);
    } else if (Array.isArray(linkData) && linkData.length > 0) {
      autoLinkedCount = (linkData[0] as any).updated_count ?? 0;
    }
  } catch (e) {
    console.error("[crm-meta-sync-campaigns] auto-link threw:", e);
  }

  // 5) Auto-clear replaced flag para campanhas reactivadas na Meta (best-effort)
  try {
    const { error: clearErr } = await supabase
      .schema("crm")
      .from("meta_campaign_snapshot")
      .update({ replaced_by_strategy_id: null })
      .eq("connection_id", connectionId)
      .eq("effective_status", "ACTIVE")
      .not("replaced_by_strategy_id", "is", null);
    if (clearErr) console.error("[crm-meta-sync-campaigns] clear-replaced failed:", clearErr);
  } catch (e) {
    console.error("[crm-meta-sync-campaigns] clear-replaced threw:", e);
  }



  return json({
    synced_count: rows.length,
    ad_account_id: adAccountId,
    mode,
    incremental_cursor: lastSyncAt,
    auto_linked_count: autoLinkedCount,
  });
});
