// cold-start trigger: 2026-06-01-v2 secret rotation
// crm-cron-pause-replaced-originals
// Cron diário. Para cada crm.meta_campaign_strategies com
// pause_original_mode='delayed_7d', pause_original_scheduled_for <= now,
// pause_original_executed_at IS NULL, e cuja source campaign ainda está
// ACTIVE: pausa a campanha original via Meta API, actualiza snapshot,
// regista em meta_campaign_changes.
//
// Auth: service_role apenas (cron-callable). Sem JWT user.
// Deploy trigger: Sprint 3a-1 (re-push)

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v21.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const MAX_ROWS_PER_RUN = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function pauseMetaCampaign(campaignId: string, accessToken: string): Promise<unknown> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${campaignId}`;
  const body = new URLSearchParams({ status: "PAUSED", access_token: accessToken });
  const resp = await fetch(url, { method: "POST", body });
  const j = await resp.json();
  if (!resp.ok || j.error) {
    const err = j.error?.message || JSON.stringify(j);
    throw new Error(`Meta API ${resp.status}: ${err}`);
  }
  return j;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // service_role auth only
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "missing_authorization" }, 401);
  try {
    const parts = token.split(".");
    if (parts.length < 2) throw new Error("invalid_jwt_shape");
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload?.role !== "service_role") {
      return json({ error: "forbidden", detail: "service_role required" }, 403);
    }
  } catch (e) {
    return json({ error: "invalid_jwt", detail: (e as Error).message }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const startedAt = new Date().toISOString();

  // 1) Find strategies with delayed pause due. JOIN snapshot para
  //    filtrar só onde a source campaign ainda está ACTIVE.
  const nowIso = new Date().toISOString();
  const { data: candidates, error: qErr } = await (supabase as any)
    .schema("crm")
    .from("meta_campaign_strategies")
    .select(
      "id, source_campaign_id, company_id, connection_id, ad_account_id, pause_original_scheduled_for",
    )
    .eq("pause_original_mode", "delayed_7d")
    .lte("pause_original_scheduled_for", nowIso)
    .is("pause_original_executed_at", null)
    .not("source_campaign_id", "is", null)
    .order("pause_original_scheduled_for", { ascending: true })
    .limit(MAX_ROWS_PER_RUN);
  if (qErr) {
    console.error("[pause-cron] strategies query error", qErr);
    return json({ error: "query_failed", detail: qErr.message }, 500);
  }
  const pending = candidates ?? [];

  const results: Array<{ strategy_id: string; source_campaign_id: string; ok: boolean; error?: string }> = [];

  for (const s of pending) {
    const strategyId: string = s.id;
    const sourceCampaignId: string = s.source_campaign_id;
    try {
      // 2) Confirmar status actual da source (saltar se já PAUSED).
      const { data: snap } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_snapshot")
        .select("id, status, effective_status, ad_account_id, connection_id")
        .eq("external_campaign_id", sourceCampaignId)
        .maybeSingle();
      if (!snap) {
        results.push({ strategy_id: strategyId, source_campaign_id: sourceCampaignId, ok: false, error: "snapshot_not_found" });
        continue;
      }
      const alreadyPaused = snap.status === "PAUSED" || snap.effective_status === "PAUSED";
      const prevStatus = snap.effective_status ?? snap.status ?? null;

      // 3) Decrypt token (per-strategy; tokens podem variar entre connections)
      const { data: tokenRows, error: tokenErr } = await supabase.rpc(
        "crm_get_meta_decrypted_token",
        {
          p_connection_id: s.connection_id,
          p_master_key: ENCRYPTION_MASTER_KEY,
        },
      );
      if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
        results.push({ strategy_id: strategyId, source_campaign_id: sourceCampaignId, ok: false, error: `token_failed: ${tokenErr?.message ?? "no_rows"}` });
        continue;
      }
      const { access_token: accessToken } = tokenRows[0] as { access_token: string; company_id: string };

      // 4) Pausar via Meta API (skip se já PAUSED — só actualiza locais)
      if (!alreadyPaused) {
        await pauseMetaCampaign(sourceCampaignId, accessToken);
      }

      // 5) Snapshot local
      await (supabase as any)
        .schema("crm")
        .from("meta_campaign_snapshot")
        .update({
          status: "PAUSED",
          effective_status: "PAUSED",
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", snap.id);

      // 6) Marcar strategy executed
      await (supabase as any)
        .schema("crm")
        .from("meta_campaign_strategies")
        .update({ pause_original_executed_at: new Date().toISOString() })
        .eq("id", strategyId);

      // 7) Audit trail (meta_campaign_changes).
      // NOTA: triggered_by usa 'cron_auto' (valor permitido pelo CHECK do
      // schema de Commit 2). change_type usa 'status' (valor permitido).
      // O contexto específico (cron_delayed_pause vs outros crons) vai no
      // reason_text.
      await (supabase as any)
        .schema("crm")
        .from("meta_campaign_changes")
        .insert({
          company_id: s.company_id,
          connection_id: s.connection_id,
          external_campaign_id: sourceCampaignId,
          change_type: "status",
          before_jsonb: { status: prevStatus ?? "ACTIVE" },
          after_jsonb: { status: "PAUSED" },
          reason_text: `Pausa automática após janela A/B de 7 dias — substituída por strategy ${strategyId}.`,
          diagnosis_id: null,
          applied_action_index: null,
          triggered_by: "cron_auto",
          measure_impact_requested: false,
          applied_by_user_id: null,
        });

      results.push({ strategy_id: strategyId, source_campaign_id: sourceCampaignId, ok: true });
    } catch (e) {
      const msg = (e as Error).message.slice(0, 300);
      console.error(`[pause-cron] failed strategy=${strategyId} source=${sourceCampaignId}:`, msg);
      results.push({ strategy_id: strategyId, source_campaign_id: sourceCampaignId, ok: false, error: msg });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  return json({
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    processed: pending.length,
    succeeded: ok,
    failed: pending.length - ok,
    results,
  });
});
