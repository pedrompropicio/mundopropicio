// cold-start trigger: 2026-06-01-v2 secret rotation
// crm-meta-entity-action
// POST { connection_id, entity_type, external_id, action, updates? }
// Pausa, ativa ou atualiza qualquer entidade Meta (campaign|adset|ad).
// Audita em crm.meta_entity_actions_log e atualiza snapshot local.

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

const SNAPSHOT_TABLE: Record<string, { table: string; idCol: string }> = {
  campaign: { table: "meta_campaign_snapshot", idCol: "external_campaign_id" },
  adset: { table: "meta_adset_snapshot", idCol: "external_adset_id" },
  ad: { table: "meta_ad_snapshot", idCol: "external_ad_id" },
};

async function metaPost(path: string, accessToken: string, params: Record<string, string>): Promise<any> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${path}`;
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const r = await fetch(url, { method: "POST", body });
  const j = await r.json();
  if (!r.ok || j.error) {
    const err = j.error?.message || JSON.stringify(j);
    const e: any = new Error(`Meta API ${r.status}: ${err}`);
    e.metaResponse = j;
    throw e;
  }
  return j;
}

async function metaGet(path: string, accessToken: string, fields: string): Promise<any> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${path}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`;
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok || j.error) {
    const err = j.error?.message || JSON.stringify(j);
    throw new Error(`Meta GET ${r.status}: ${err}`);
  }
  return j;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const {
    connection_id, entity_type, external_id, action, updates,
    // Campos opcionais para o audit trail crm.meta_campaign_changes:
    diagnosis_id, applied_action_index, triggered_by, reason_text, measure_impact_requested,
    // ── DRY-RUN ── Quando true, valida e devolve o impacto planeado SEM
    // chamar a Graph API. Usado pelo modal ConfirmMetaActionDialog.
    dry_run,
  } = body ?? {};
  const dryRun: boolean = dry_run === true;
  if (!connection_id || !entity_type || !external_id || !action) {
    return json({ error: "missing_fields", required: ["connection_id", "entity_type", "external_id", "action"] }, 400);
  }
  if (!SNAPSHOT_TABLE[entity_type]) {
    return json({ error: "invalid_entity_type", message: "entity_type deve ser campaign, adset ou ad" }, 400);
  }
  if (!["pause", "activate", "update"].includes(action)) {
    return json({ error: "invalid_action", message: "action deve ser pause, activate ou update" }, 400);
  }
  const triggeredBy: string = typeof triggered_by === "string" && ["user_manual","cron_auto","ai_suggestion"].includes(triggered_by)
    ? triggered_by
    : "user_manual";

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized", detail: userErr?.message }, 401);
  const userId = userData.user.id;

  // ── GUARDRAIL: cap de budget diário por role ────────────────────────────────
  // Só aplica a updates que mexem na verba diária. Bloqueia ANTES de tocar na Meta.
  // Em dry_run, em vez de devolver 403 imediato, regista `blockedReason` e devolve
  // um sumário com `blocked:true` mais à frente — o modal precisa de mostrar o item.
  let blockedReason: string | null = null;
  let capEurCached: number | null = null;
  let attemptedEurCached: number | null = null;
  if (action === "update" && typeof updates?.daily_budget_cents === "number") {
    const { data: capData, error: capErr } = await supabase.rpc(
      "get_user_max_daily_budget_eur",
      { _user_id: userId },
    );
    if (capErr) {
      console.error("[entity-action] failed to read budget cap", capErr);
      return json({ error: "internal_error", message: "Failed to check budget cap." }, 500);
    }
    // numeric vem como string via PostgREST → coerção (preserva null = sem limite).
    const capEur: number | null = capData === null ? null : Number(capData);
    const attemptedEur = updates.daily_budget_cents / 100;
    capEurCached = capEur;
    attemptedEurCached = attemptedEur;
    console.log("[entity-action] budget cap check", { userId, capEur, attemptedEur, dryRun });
    if (capEur === 0) blockedReason = "no_budget_authority";
    else if (capEur !== null && attemptedEur > capEur) blockedReason = "budget_cap_exceeded";

    // Em modo real, falha já. Em dry_run continuamos para devolver o impacto.
    if (blockedReason && !dryRun) {
      if (blockedReason === "no_budget_authority") {
        return json({ error: "no_budget_authority", message: "User has no role authorised to set budget." }, 403);
      }
      return json({
        error: "budget_cap_exceeded",
        message: `Daily budget €${attemptedEur} exceeds your limit of €${capEur}/day.`,
        cap_eur: capEur,
        attempted_eur: attemptedEur,
      }, 403);
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  // Token + companyId
  const { data: tokenRows, error: tokenErr } = await supabase.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: connection_id,
    p_master_key: ENCRYPTION_MASTER_KEY,
  });
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "token_failed", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken, company_id: companyId } = tokenRows[0] as { access_token: string; company_id: string };

  // Snapshot atual (pode não existir se for entidade legacy nunca sincronizada — tudo bem)
  const snapMeta = SNAPSHOT_TABLE[entity_type];
  const snapSelectCols = entity_type === "campaign"
    ? `id, name, status, effective_status, ad_account_id, bid_strategy, daily_budget_cents, lifetime_budget_cents, external_campaign_id`
    : entity_type === "adset"
    ? `id, name, status, effective_status, ad_account_id, daily_budget_cents, lifetime_budget_cents, external_campaign_id`
    : `id, name, status, effective_status, ad_account_id, external_adset_id, external_campaign_id`;
  const { data: snapRow } = await (supabase as any)
    .schema("crm").from(snapMeta.table)
    .select(snapSelectCols)
    .eq(snapMeta.idCol, external_id)
    .eq("connection_id", connection_id)
    .maybeSingle();

  const prevStatus = snapRow?.effective_status ?? snapRow?.status ?? null;
  const entityName = snapRow?.name ?? null;
  const adAccountId: string = snapRow?.ad_account_id ?? body.ad_account_id ?? "";

  // Snapshot canonicalizado para before_jsonb do audit trail.
  const beforeJsonb = snapRow ? {
    name: (snapRow as any).name ?? null,
    status: (snapRow as any).status ?? null,
    effective_status: (snapRow as any).effective_status ?? null,
    daily_budget_cents: (snapRow as any).daily_budget_cents ?? null,
    lifetime_budget_cents: (snapRow as any).lifetime_budget_cents ?? null,
    bid_strategy: (snapRow as any).bid_strategy ?? null,
  } : null;

  // Construir payload Meta + nome semântico da action
  let metaParams: Record<string, string> = {};
  let actionLogged: string;

  if (action === "pause") {
    metaParams = { status: "PAUSED" };
    actionLogged = "pause";
  } else if (action === "activate") {
    metaParams = { status: "ACTIVE" };
    actionLogged = "activate";
  } else {
    // update — pelo menos um campo
    if (!updates || typeof updates !== "object") {
      return json({ error: "missing_updates" }, 400);
    }
    if (typeof updates.name === "string" && updates.name.trim()) {
      metaParams.name = updates.name.trim();
      actionLogged = "update_name";
    }
    if (typeof updates.daily_budget_cents === "number") {
      metaParams.daily_budget = String(updates.daily_budget_cents);
      actionLogged = "update_budget";
    }
    if (typeof updates.lifetime_budget_cents === "number") {
      metaParams.lifetime_budget = String(updates.lifetime_budget_cents);
      actionLogged = "update_budget";
    }
    if (typeof updates.end_time === "string" && updates.end_time) {
      metaParams.end_time = updates.end_time;
      actionLogged = "update_end_time";
    }
    if (typeof updates.roas_average_floor === "number") {
      const bidStrat = (snapRow as any)?.bid_strategy ?? null;
      if (entity_type === "campaign" && bidStrat && bidStrat !== "LOWEST_COST_WITH_MIN_ROAS") {
        return json({
          error: "incompatible_bid_strategy",
          message: `Esta entidade não suporta ROAS floor (bid_strategy actual: ${bidStrat}).`,
        }, 400);
      }
      // Meta espera o ROAS floor como inteiro (multiplicado por 1.000.000). Ex: 4.5x → 4500000
      const roasInt = Math.round(updates.roas_average_floor * 1_000_000);
      metaParams.bid_strategy = "LOWEST_COST_WITH_MIN_ROAS";
      metaParams.roas_average_floor = String(roasInt);
      actionLogged = "update_roas_floor";
    }
    if (Object.keys(metaParams).length === 0) {
      return json({ error: "no_valid_updates" }, 400);
    }
    actionLogged = actionLogged!;
  }

  // ── DRY-RUN: devolve impacto planeado SEM tocar na Graph API ──────────────
  // NENHUM POST/PATCH ao graph.facebook.com é executado neste branch.
  if (dryRun) {
    const before = {
      name: (snapRow as any)?.name ?? null,
      status: prevStatus,
      daily_budget_cents: (snapRow as any)?.daily_budget_cents ?? null,
      lifetime_budget_cents: (snapRow as any)?.lifetime_budget_cents ?? null,
      bid_strategy: (snapRow as any)?.bid_strategy ?? null,
    };
    const after: any = { ...before };
    if (action === "pause") after.status = "PAUSED";
    else if (action === "activate") after.status = "ACTIVE";
    else {
      if (typeof updates?.name === "string" && updates.name.trim()) after.name = updates.name.trim();
      if (typeof updates?.daily_budget_cents === "number") after.daily_budget_cents = updates.daily_budget_cents;
      if (typeof updates?.lifetime_budget_cents === "number") after.lifetime_budget_cents = updates.lifetime_budget_cents;
      if (typeof metaParams.bid_strategy === "string") after.bid_strategy = metaParams.bid_strategy;
    }
    return json({
      ok: true,
      dry_run: true,
      entity_type,
      external_id,
      entity_name: entityName,
      action: actionLogged,
      action_kind: actionLogged === "pause" ? "pause"
        : actionLogged === "activate" ? "activate"
        : actionLogged === "update_budget" ? "budget"
        : actionLogged === "update_name" ? "name"
        : actionLogged === "update_roas_floor" ? "bid"
        : actionLogged === "update_end_time" ? "end_time"
        : "other",
      before,
      after,
      blocked: blockedReason !== null,
      block_reason: blockedReason,
      cap_eur: capEurCached,
      attempted_eur: attemptedEurCached,
      warnings: [],
    });
  }

  // POST ao Meta

  let metaResponse: any = null;
  let newStatus: string | null = null;
  let effectiveStatus: string | null = null;
  let snapshotUpdated = false;

  try {
    metaResponse = await metaPost(external_id, accessToken, metaParams);

    // Re-fetch para obter effective_status real
    try {
      const fields = entity_type === "campaign"
        ? "id,name,status,effective_status,daily_budget,lifetime_budget,stop_time"
        : entity_type === "adset"
        ? "id,name,status,effective_status,daily_budget,lifetime_budget,end_time"
        : "id,name,status,effective_status";
      const fresh = await metaGet(external_id, accessToken, fields);
      newStatus = fresh.status ?? metaParams.status ?? prevStatus;
      effectiveStatus = fresh.effective_status ?? newStatus;

      // UPSERT snapshot se já existir; se não, ignora silenciosamente
      if (snapRow?.id) {
        const upd: any = {
          status: newStatus,
          effective_status: effectiveStatus,
          last_synced_at: new Date().toISOString(),
        };
        if (fresh.name) upd.name = fresh.name;
        if (fresh.daily_budget !== undefined) upd.daily_budget_cents = parseInt(fresh.daily_budget, 10) || null;
        if (fresh.lifetime_budget !== undefined) upd.lifetime_budget_cents = parseInt(fresh.lifetime_budget, 10) || null;
        const { error: updErr } = await (supabase as any).schema("crm").from(snapMeta.table)
          .update(upd).eq("id", snapRow.id);
        if (!updErr) snapshotUpdated = true;
      }
    } catch (refetchErr) {
      console.warn("[crm-meta-entity-action] refetch failed:", (refetchErr as Error).message);
      newStatus = metaParams.status ?? prevStatus;
      effectiveStatus = newStatus;
    }

    // Log success no audit log existente (mantido inalterado).
    await (supabase as any).schema("crm").from("meta_entity_actions_log").insert({
      company_id: companyId,
      connection_id,
      ad_account_id: adAccountId,
      entity_type,
      external_id,
      entity_name: entityName,
      action: actionLogged,
      prev_status: prevStatus,
      new_status: effectiveStatus,
      updates_jsonb: action === "update" ? updates : metaParams,
      success: true,
      meta_response_jsonb: metaResponse,
      performed_by: userId,
    });

    // Audit trail rico em meta_campaign_changes (paralelo, falha aqui não rolla back).
    const changeType =
      actionLogged === "pause" || actionLogged === "activate" ? "status" :
      actionLogged === "update_name" ? "name" :
      actionLogged === "update_budget" ? "budget" :
      actionLogged === "update_roas_floor" ? "bid" :
      "other";
    const afterJsonb = {
      name: typeof metaParams.name === "string" ? metaParams.name : (snapRow as any)?.name ?? null,
      status: newStatus,
      effective_status: effectiveStatus,
      daily_budget_cents: typeof metaParams.daily_budget === "string"
        ? (parseInt(metaParams.daily_budget, 10) || null)
        : (snapRow as any)?.daily_budget_cents ?? null,
      lifetime_budget_cents: typeof metaParams.lifetime_budget === "string"
        ? (parseInt(metaParams.lifetime_budget, 10) || null)
        : (snapRow as any)?.lifetime_budget_cents ?? null,
      bid_strategy: typeof metaParams.bid_strategy === "string"
        ? metaParams.bid_strategy
        : (snapRow as any)?.bid_strategy ?? null,
    };
    const changeIds: { external_campaign_id: string | null; external_adset_id: string | null; external_ad_id: string | null } = {
      external_campaign_id: null, external_adset_id: null, external_ad_id: null,
    };
    if (entity_type === "campaign") {
      changeIds.external_campaign_id = external_id;
    } else if (entity_type === "adset") {
      changeIds.external_adset_id = external_id;
      changeIds.external_campaign_id = (snapRow as any)?.external_campaign_id ?? null;
    } else {
      changeIds.external_ad_id = external_id;
      changeIds.external_adset_id = (snapRow as any)?.external_adset_id ?? null;
      changeIds.external_campaign_id = (snapRow as any)?.external_campaign_id ?? null;
    }
    try {
      const { error: changeInsErr } = await (supabase as any).schema("crm").from("meta_campaign_changes").insert({
        company_id: companyId,
        connection_id,
        external_campaign_id: changeIds.external_campaign_id,
        external_adset_id: changeIds.external_adset_id,
        external_ad_id: changeIds.external_ad_id,
        change_type: changeType,
        before_jsonb: beforeJsonb,
        after_jsonb: afterJsonb,
        reason_text: typeof reason_text === "string" ? reason_text.slice(0, 2000) : null,
        diagnosis_id: typeof diagnosis_id === "string" ? diagnosis_id : null,
        applied_action_index: Number.isInteger(applied_action_index) ? applied_action_index : null,
        triggered_by: triggeredBy,
        measure_impact_requested: measure_impact_requested === true,
        applied_by_user_id: userId,
      });
      if (changeInsErr) console.warn("[entity-action] meta_campaign_changes insert failed:", changeInsErr.message);
    } catch (e) {
      console.warn("[entity-action] meta_campaign_changes insert exception:", (e as Error).message);
    }

    return json({
      ok: true,
      new_status: newStatus,
      effective_status: effectiveStatus,
      snapshot_updated: snapshotUpdated,
    });
  } catch (e: any) {
    const errMsg = (e?.message ?? String(e)).slice(0, 500);
    await (supabase as any).schema("crm").from("meta_entity_actions_log").insert({
      company_id: companyId,
      connection_id,
      ad_account_id: adAccountId,
      entity_type,
      external_id,
      entity_name: entityName,
      action: actionLogged,
      prev_status: prevStatus,
      new_status: null,
      updates_jsonb: action === "update" ? updates : metaParams,
      success: false,
      error_message: errMsg,
      meta_response_jsonb: e?.metaResponse ?? null,
      performed_by: userId,
    });
    return json({ ok: false, error: "meta_action_failed", detail: errMsg }, 502);
  }
});
