// _shared/campaign-brief.ts
// Brief determinístico único (DR-2026-06-26 ponto 3 + DR-2026-06-26b).
// READ-ONLY. Sem LLM. Não trunca nada — o caller serializa/trunca.
//
// Critério ÚNICO de "vencedor" (D1): rácio ROAS puro, igual ao redesign.
//   winner se creative_roas >= caps.target_blended_roas * 0.6,
//   gates spend>=€50 e purchases>=3;
//   abaixo dos gates → "inconclusive"; senão → "loser".

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v21.0";

// ────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ────────────────────────────────────────────────────────────────────────────

export type BudgetCaps = {
  target_blended_roas: number;          // D5 — passado pelo caller
  daily_budget_cents?: number | null;
  lifetime_budget_cents?: number | null;
  roas_floor?: number | null;
  end_time?: string | null;
};

export type WinnerLabel = "winner" | "loser" | "inconclusive";

export type CreativePerformance = {
  spend_eur: number;
  purchases_count: number;
  purchases_value_eur: number;
  roas: number | null;
};

export type WinnerPacket = {
  meta_creative_id: string;
  ad_name: string | null;
  library: {
    id?: string;
    name?: string | null;
    type?: string | null;
    file_url?: string | null;
    headline?: string | null;
    body?: string | null;
    cta_type?: string | null;
    link_url?: string | null;
  } | null;
  performance: CreativePerformance;
  label: WinnerLabel;
};

export type AudiencePacket = {
  id: string;
  name: string;
  subtype?: string | null;
  approximate_count_lower_bound?: number | null;
  approximate_count_upper_bound?: number | null;
};

export type AdsetSummary = {
  external_adset_id: string;
  name: string | null;
  optimization_goal: string | null;
  billing_event: string | null;
  daily_budget_cents?: number | null;
  lifetime_budget_cents?: number | null;
};

export type PeerSummary = {
  external_campaign_id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  spend_eur: number;
  purchases: number;
  roas: number | null;
};

export type EventContext = {
  id: string | null;
  name: string | null;
  date: string | null;
  effective_date: string | null;
  event_date_source: string | null;
  days_until: number | null;
  tickets_total: number | null;
  location: string | null;
  ticketing_url: string | null;
};

export type ROASBuckets = {
  roas_7d: number | null;
  roas_28d: number | null;
  roas_lifetime: number | null;
};

export type CampaignBrief = {
  generated_at: string;
  schema_version: 1;

  campaign: {
    external_campaign_id: string;
    company_id: string;
    connection_id: string;
    ad_account_id: string;
    name: string | null;
    status: string | null;
    effective_status: string | null;
    objective: string | null;
    currency: string | null;
    linked_event_id: string | null;
    daily_budget_cents: number | null;
    lifetime_budget_cents: number | null;
  };

  caps: BudgetCaps;
  winner_roas_threshold: number;       // = caps.target_blended_roas * 0.6

  event: EventContext;

  // Diagnóstico 360 COMPLETO (D4) — sem truncar.
  diagnosis_360: Record<string, unknown> | null;

  roas_buckets: ROASBuckets;

  adsets: AdsetSummary[];

  winners_packet: WinnerPacket[];      // criativos da própria campanha, classificados

  reference: null | {
    external_campaign_id: string;
    name: string | null;
    creatives: WinnerPacket[];         // criativos da campanha-referência classificados
    adsets: AdsetSummary[];
  };

  audiences: AudiencePacket[];          // custom audiences do ad account (best-effort)

  peers: PeerSummary[];                 // outras campanhas do mesmo evento

  meta: {
    graph_api_version: string;
    rules: {
      winner_min_spend_eur: number;
      winner_min_purchases: number;
      winner_roas_ratio: number;
    };
    warnings: string[];
  };
};

export type BuildBriefArgs = {
  supabase: SupabaseClient;                 // cliente autenticado (RLS aplicada)
  campaign_id: string;
  caps: BudgetCaps;                          // D5 — obrigatório target_blended_roas
  reference_campaign_id?: string | null;
  period_days?: number;                      // janela legacy (default 30)
  meta_access_token?: string | null;         // opcional, p/ custom audiences
};

// ────────────────────────────────────────────────────────────────────────────
// Constantes (espelham redesign — fonte da regra D1)
// ────────────────────────────────────────────────────────────────────────────

const CREATIVE_MIN_SPEND_EUR = 50;
const CREATIVE_MIN_PURCHASES = 3;
const CREATIVE_WINNER_ROAS_RATIO = 0.6;

// ────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ────────────────────────────────────────────────────────────────────────────

type Agg = {
  spendCents: number; purchases: number; purchasesValueCents: number;
};
const emptyAgg = (): Agg => ({ spendCents: 0, purchases: 0, purchasesValueCents: 0 });
function aggregateInto(t: Agg, r: any) {
  t.spendCents += Number(r.spend_cents ?? 0);
  t.purchases += Number(r.purchases_count ?? 0);
  t.purchasesValueCents += Number(r.purchases_value_cents ?? 0);
}
function roasOf(a: Agg): number | null {
  return a.spendCents > 0 ? Math.round((a.purchasesValueCents / a.spendCents) * 10000) / 10000 : null;
}

function normalizeAdAccountId(raw: string): string {
  const s = (raw ?? "").toString().trim();
  if (!s) return "";
  return s.startsWith("act_") ? s : `act_${s}`;
}

type EffDate = { ms: number; source: "master" | "child" | "event_dates"; is_future: boolean };
function resolveEffectiveEventDate(
  masterDate: string | null,
  children: Array<{ date: string | null }>,
  eventDates: Array<{ date: string | null }>,
): { effectiveMs: number | null; source: EffDate["source"] | null } {
  const now = Date.now();
  const all: EffDate[] = [];
  const push = (d: string | null | undefined, s: EffDate["source"]) => {
    if (!d) return;
    const t = new Date(d).getTime();
    if (!Number.isFinite(t)) return;
    all.push({ ms: t, source: s, is_future: t >= now });
  };
  push(masterDate, "master");
  for (const c of children) push(c.date, "child");
  for (const e of eventDates) push(e.date, "event_dates");
  if (all.length === 0) return { effectiveMs: null, source: null };
  const futures = all.filter(d => d.is_future);
  const pick = futures.length
    ? futures.reduce((a, b) => (a.ms <= b.ms ? a : b))
    : all.reduce((a, b) => (a.ms >= b.ms ? a : b));
  return { effectiveMs: pick.ms, source: pick.source };
}

/**
 * Classifica criativos pela regra D1 (ROAS puro + gates de volume).
 * Lê meta_ad_snapshot + meta_creatives + meta_ad_insights_daily.
 * Reusado pela campanha principal e pela campanha-referência.
 */
async function classifyCreativesForCampaign(
  supabase: SupabaseClient,
  companyId: string,
  externalCampaignId: string,
  winnerRoasThreshold: number,
): Promise<WinnerPacket[]> {
  const sb: any = supabase;

  // Ads + creatives
  const { data: ads } = await sb
    .schema("crm").from("meta_ad_snapshot")
    .select("external_ad_id, meta_creative_id, name, effective_status")
    .eq("company_id", companyId)
    .eq("external_campaign_id", externalCampaignId)
    .not("meta_creative_id", "is", null);

  const inheritedMap = new Map<string, { meta_creative_id: string; ad_name: string | null; library: any | null }>();
  const adToCreative = new Map<string, string>();
  for (const a of ads ?? []) {
    if (!a.meta_creative_id) continue;
    if (a.external_ad_id) adToCreative.set(a.external_ad_id, a.meta_creative_id);
    if (!inheritedMap.has(a.meta_creative_id)) {
      inheritedMap.set(a.meta_creative_id, { meta_creative_id: a.meta_creative_id, ad_name: a.name ?? null, library: null });
    }
  }
  const inheritedIds = [...inheritedMap.keys()];
  if (inheritedIds.length === 0) return [];

  const { data: lib } = await sb
    .schema("crm").from("meta_creatives")
    .select("id, name, type, file_url, headline, body, cta_type, link_url, meta_creative_id")
    .in("meta_creative_id", inheritedIds);
  for (const c of lib ?? []) {
    const slot = inheritedMap.get(c.meta_creative_id);
    if (slot) slot.library = c;
  }

  // Insights all-time por ad
  const perfByCreative = new Map<string, Agg>();
  for (const id of inheritedIds) perfByCreative.set(id, emptyAgg());
  const adIds = [...adToCreative.keys()];
  if (adIds.length > 0) {
    const { data: insights } = await sb
      .schema("crm").from("meta_ad_insights_daily")
      .select("external_ad_id, spend_cents, purchases_value_cents, purchases_count")
      .eq("company_id", companyId)
      .eq("external_campaign_id", externalCampaignId)
      .in("external_ad_id", adIds);
    for (const r of insights ?? []) {
      const cid = adToCreative.get(r.external_ad_id);
      if (!cid) continue;
      const agg = perfByCreative.get(cid)!;
      aggregateInto(agg, r);
    }
  }

  const out: WinnerPacket[] = [];
  for (const slot of inheritedMap.values()) {
    const agg = perfByCreative.get(slot.meta_creative_id) ?? emptyAgg();
    const spend_eur = agg.spendCents / 100;
    const pv_eur = agg.purchasesValueCents / 100;
    const roas = roasOf(agg);
    let label: WinnerLabel;
    if (spend_eur < CREATIVE_MIN_SPEND_EUR || agg.purchases < CREATIVE_MIN_PURCHASES) {
      label = "inconclusive";
    } else {
      label = roas != null && roas >= winnerRoasThreshold ? "winner" : "loser";
    }
    out.push({
      meta_creative_id: slot.meta_creative_id,
      ad_name: slot.ad_name,
      library: slot.library,
      performance: {
        spend_eur: Math.round(spend_eur * 100) / 100,
        purchases_count: agg.purchases,
        purchases_value_eur: Math.round(pv_eur * 100) / 100,
        roas,
      },
      label,
    });
  }
  return out;
}

async function loadAdsets(
  supabase: SupabaseClient,
  externalCampaignId: string,
): Promise<AdsetSummary[]> {
  const { data } = await (supabase as any)
    .schema("crm").from("meta_adset_snapshot")
    .select("external_adset_id, name, optimization_goal, billing_event, daily_budget_cents, lifetime_budget_cents")
    .eq("external_campaign_id", externalCampaignId);
  return (data ?? []) as AdsetSummary[];
}

// ────────────────────────────────────────────────────────────────────────────
// API pública
// ────────────────────────────────────────────────────────────────────────────

export async function buildCampaignBrief(args: BuildBriefArgs): Promise<CampaignBrief> {
  const { supabase, campaign_id, caps, reference_campaign_id, period_days, meta_access_token } = args;
  if (!campaign_id) throw new Error("missing_campaign_id");
  if (!caps || typeof caps.target_blended_roas !== "number" || !(caps.target_blended_roas > 0)) {
    throw new Error("missing_or_invalid_caps.target_blended_roas");
  }
  const periodDays = Math.min(Math.max(period_days ?? 30, 7), 90);
  const winnerRoasThreshold = caps.target_blended_roas * CREATIVE_WINNER_ROAS_RATIO;
  const warnings: string[] = [];
  const sb: any = supabase;

  // 1) Snapshot da campanha
  const { data: campaign, error: campErr } = await sb
    .schema("crm").from("meta_campaign_snapshot")
    .select("company_id, connection_id, ad_account_id, external_campaign_id, name, status, effective_status, objective, currency, linked_event_id, daily_budget_cents, lifetime_budget_cents")
    .eq("external_campaign_id", campaign_id)
    .maybeSingle();
  if (campErr || !campaign) throw new Error(`campaign_not_found: ${campErr?.message ?? campaign_id}`);

  // 2) Diagnóstico 360 — COMPLETO (D4)
  const { data: diagRow } = await sb
    .schema("crm").from("campaign_diagnosis_360")
    .select("*")
    .eq("external_campaign_id", campaign_id)
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  if (!diagRow) warnings.push("no_diagnosis_360");

  // 3) ROAS buckets (7d / 28d / lifetime)
  const today = new Date();
  const cutoff7 = new Date(today); cutoff7.setUTCDate(cutoff7.getUTCDate() - 6);
  const cutoff28 = new Date(today); cutoff28.setUTCDate(cutoff28.getUTCDate() - 27);
  const c7 = cutoff7.toISOString().slice(0, 10);
  const c28 = cutoff28.toISOString().slice(0, 10);

  const { data: campInsights } = await sb
    .schema("crm").from("meta_campaign_insights_daily")
    .select("date_start, spend_cents, purchases_count, purchases_value_cents")
    .eq("external_campaign_id", campaign_id)
    .order("date_start", { ascending: false });

  const a7 = emptyAgg(), a28 = emptyAgg(), aLife = emptyAgg();
  for (const r of campInsights ?? []) {
    const d = r.date_start as string;
    aggregateInto(aLife, r);
    if (d >= c28) aggregateInto(a28, r);
    if (d >= c7) aggregateInto(a7, r);
  }
  const roas_buckets: ROASBuckets = {
    roas_7d: roasOf(a7),
    roas_28d: roasOf(a28),
    roas_lifetime: roasOf(aLife),
  };

  // 4) Adsets da campanha
  const adsets = await loadAdsets(supabase, campaign_id);

  // 5) Criativos classificados (D1)
  const winners_packet = await classifyCreativesForCampaign(
    supabase, campaign.company_id, campaign_id, winnerRoasThreshold,
  );

  // 6) Evento + data efetiva
  let event: EventContext = {
    id: null, name: null, date: null, effective_date: null, event_date_source: null,
    days_until: null, tickets_total: null, location: null, ticketing_url: null,
  };
  if (campaign.linked_event_id) {
    const { data: e } = await supabase.from("events")
      .select("id, name, date, location, tickets_total, ticketing_url")
      .eq("id", campaign.linked_event_id).maybeSingle();
    if (e) {
      const [{ data: children }, { data: dates }] = await Promise.all([
        supabase.from("events").select("date").eq("parent_event_id", (e as any).id),
        supabase.from("event_dates").select("date").eq("event_id", (e as any).id),
      ]);
      const resolved = resolveEffectiveEventDate(
        (e as any).date ?? null,
        (children ?? []) as any,
        (dates ?? []) as any,
      );
      const daysUntil = resolved.effectiveMs != null
        ? Math.max(0, Math.round((resolved.effectiveMs - Date.now()) / 86400000))
        : null;
      const effIso = resolved.effectiveMs != null
        ? new Date(resolved.effectiveMs).toISOString().slice(0, 10) : null;
      event = {
        id: (e as any).id,
        name: (e as any).name,
        date: (e as any).date,
        effective_date: effIso,
        event_date_source: resolved.source,
        days_until: daysUntil,
        tickets_total: (e as any).tickets_total,
        location: (e as any).location,
        ticketing_url: (e as any).ticketing_url ?? null,
      };
    }
  }

  // 7) Peers do mesmo evento (janela periodDays)
  const peers: PeerSummary[] = [];
  if (campaign.linked_event_id) {
    const toDate = today.toISOString().slice(0, 10);
    const since = new Date(today); since.setUTCDate(since.getUTCDate() - (periodDays - 1));
    const fromDate = since.toISOString().slice(0, 10);

    const { data: peersRaw } = await sb
      .schema("crm").from("meta_campaign_snapshot")
      .select("external_campaign_id, name, status, effective_status")
      .eq("linked_event_id", campaign.linked_event_id)
      .neq("external_campaign_id", campaign_id)
      .limit(10);
    const peerIds: string[] = (peersRaw ?? []).map((p: any) => p.external_campaign_id);
    let peerAggs = new Map<string, Agg>();
    if (peerIds.length > 0) {
      const { data: pi } = await sb
        .schema("crm").from("meta_campaign_insights_daily")
        .select("external_campaign_id, spend_cents, purchases_count, purchases_value_cents")
        .in("external_campaign_id", peerIds)
        .gte("date_start", fromDate).lte("date_start", toDate);
      for (const id of peerIds) peerAggs.set(id, emptyAgg());
      for (const r of pi ?? []) {
        const a = peerAggs.get(r.external_campaign_id);
        if (a) aggregateInto(a, r);
      }
    }
    for (const p of peersRaw ?? []) {
      const a = peerAggs.get(p.external_campaign_id) ?? emptyAgg();
      peers.push({
        external_campaign_id: p.external_campaign_id,
        name: p.name ?? null,
        status: p.status ?? null,
        effective_status: p.effective_status ?? null,
        spend_eur: Math.round((a.spendCents / 100) * 100) / 100,
        purchases: a.purchases,
        roas: roasOf(a),
      });
    }
  }

  // 8) Reference campaign (opcional) — mesma classificação D1
  let reference: CampaignBrief["reference"] = null;
  if (reference_campaign_id && reference_campaign_id !== campaign_id) {
    const { data: ref } = await sb
      .schema("crm").from("meta_campaign_snapshot")
      .select("company_id, external_campaign_id, name")
      .eq("external_campaign_id", reference_campaign_id)
      .maybeSingle();
    if (ref) {
      const refCreatives = await classifyCreativesForCampaign(
        supabase, ref.company_id, reference_campaign_id, winnerRoasThreshold,
      );
      const refAdsets = await loadAdsets(supabase, reference_campaign_id);
      reference = {
        external_campaign_id: reference_campaign_id,
        name: ref.name ?? null,
        creatives: refCreatives,
        adsets: refAdsets,
      };
    } else {
      warnings.push("reference_campaign_not_found");
    }
  }

  // 9) Custom audiences (Graph API, best-effort)
  const audiences: AudiencePacket[] = [];
  if (meta_access_token && campaign.ad_account_id) {
    try {
      const adAcc = normalizeAdAccountId(campaign.ad_account_id);
      const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAcc}/customaudiences`);
      u.searchParams.set("fields", "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound");
      u.searchParams.set("limit", "100");
      u.searchParams.set("access_token", meta_access_token);
      const r = await fetch(u);
      const j = await r.json();
      if (r.ok && Array.isArray(j?.data)) {
        for (const x of j.data) {
          audiences.push({
            id: x.id,
            name: x.name,
            subtype: x.subtype ?? null,
            approximate_count_lower_bound: x.approximate_count_lower_bound ?? null,
            approximate_count_upper_bound: x.approximate_count_upper_bound ?? null,
          });
        }
      } else {
        warnings.push(`audiences_fetch_failed:${j?.error?.message ?? r.status}`);
      }
    } catch (e) {
      warnings.push(`audiences_exception:${(e as Error).message}`);
    }
  } else if (!meta_access_token) {
    warnings.push("audiences_skipped_no_token");
  }

  return {
    generated_at: new Date().toISOString(),
    schema_version: 1,
    campaign: {
      external_campaign_id: campaign.external_campaign_id,
      company_id: campaign.company_id,
      connection_id: campaign.connection_id,
      ad_account_id: campaign.ad_account_id,
      name: campaign.name ?? null,
      status: campaign.status ?? null,
      effective_status: campaign.effective_status ?? null,
      objective: campaign.objective ?? null,
      currency: campaign.currency ?? null,
      linked_event_id: campaign.linked_event_id ?? null,
      daily_budget_cents: campaign.daily_budget_cents ?? null,
      lifetime_budget_cents: campaign.lifetime_budget_cents ?? null,
    },
    caps,
    winner_roas_threshold: Math.round(winnerRoasThreshold * 10000) / 10000,
    event,
    diagnosis_360: (diagRow ?? null) as any,
    roas_buckets,
    adsets,
    winners_packet,
    reference,
    audiences,
    peers,
    meta: {
      graph_api_version: GRAPH_API_VERSION,
      rules: {
        winner_min_spend_eur: CREATIVE_MIN_SPEND_EUR,
        winner_min_purchases: CREATIVE_MIN_PURCHASES,
        winner_roas_ratio: CREATIVE_WINNER_ROAS_RATIO,
      },
      warnings,
    },
  };
}

// Re-export útil
export { CREATIVE_MIN_SPEND_EUR, CREATIVE_MIN_PURCHASES, CREATIVE_WINNER_ROAS_RATIO };
