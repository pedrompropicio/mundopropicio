// crm-measure-action-impact
// Cron diário. Para cada crm.meta_campaign_changes pendente (applied_at >=7d
// atrás e impact_measured_at IS NULL), agrega métricas Meta 7d antes/depois
// da mudança e popula impact_metrics_jsonb.
//
// Auth: service_role apenas (cron-callable). Sem JWT user.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_ROWS_PER_RUN = 100;

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

type ChangeRow = {
  id: string;
  company_id: string;
  external_campaign_id: string | null;
  external_adset_id: string | null;
  external_ad_id: string | null;
  applied_at: string;
};

type InsightRow = {
  date_start: string;
  spend_cents: number | null;
  impressions: number | null;
  clicks: number | null;
  purchases_count: number | null;
  purchases_value_cents: number | null;
};

type Agg = {
  spend_cents: number;
  impressions: number;
  clicks: number;
  purchases_count: number;
  purchases_value_cents: number;
  days_with_data: number;
};

function emptyAgg(): Agg {
  return { spend_cents: 0, impressions: 0, clicks: 0, purchases_count: 0, purchases_value_cents: 0, days_with_data: 0 };
}

function aggregate(rows: InsightRow[]): Agg {
  const a = emptyAgg();
  for (const r of rows) {
    a.spend_cents += r.spend_cents ?? 0;
    a.impressions += r.impressions ?? 0;
    a.clicks += r.clicks ?? 0;
    a.purchases_count += r.purchases_count ?? 0;
    a.purchases_value_cents += r.purchases_value_cents ?? 0;
    if ((r.spend_cents ?? 0) > 0 || (r.impressions ?? 0) > 0) a.days_with_data++;
  }
  return a;
}

function metricsOf(a: Agg) {
  const ctr = a.impressions > 0 ? a.clicks / a.impressions : 0;
  const roas = a.spend_cents > 0 ? a.purchases_value_cents / a.spend_cents : null;
  const cpa_eur = a.purchases_count > 0 ? (a.spend_cents / a.purchases_count) / 100 : null;
  return {
    spend_eur: a.spend_cents / 100,
    revenue_eur: a.purchases_value_cents / 100,
    impressions: a.impressions,
    clicks: a.clicks,
    purchases: a.purchases_count,
    ctr,
    roas,
    cpa_eur,
    days_with_data: a.days_with_data,
  };
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function appliedDateISO(applied_at: string): string {
  return new Date(applied_at).toISOString().slice(0, 10);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // service_role auth only — extract role from JWT
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

  // 1) Find pending rows
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: rows, error: qErr } = await (supabase as any)
    .schema("crm")
    .from("meta_campaign_changes")
    .select("id, company_id, external_campaign_id, external_adset_id, external_ad_id, applied_at")
    .is("impact_measured_at", null)
    .lt("applied_at", sevenDaysAgoIso)
    .order("applied_at", { ascending: true })
    .limit(MAX_ROWS_PER_RUN);
  if (qErr) {
    console.error("[impact] query error", qErr);
    return json({ error: "query_failed", detail: qErr.message }, 500);
  }
  const pending: ChangeRow[] = rows ?? [];

  const results: Array<{ id: string; ok: boolean; error?: string; metrics?: any }> = [];

  for (const row of pending) {
    try {
      const appliedDate = appliedDateISO(row.applied_at);
      const beforeFrom = addDays(appliedDate, -7);
      const beforeTo = addDays(appliedDate, -1);
      const afterFrom = addDays(appliedDate, 1);
      const afterTo = addDays(appliedDate, 7);

      let tableName: string;
      let idCol: string;
      let idValue: string;
      if (row.external_ad_id) {
        tableName = "meta_ad_insights_daily"; idCol = "external_ad_id"; idValue = row.external_ad_id;
      } else if (row.external_adset_id) {
        tableName = "meta_adset_insights_daily"; idCol = "external_adset_id"; idValue = row.external_adset_id;
      } else if (row.external_campaign_id) {
        tableName = "meta_campaign_insights_daily"; idCol = "external_campaign_id"; idValue = row.external_campaign_id;
      } else {
        results.push({ id: row.id, ok: false, error: "no_external_id" });
        continue;
      }

      const fetchWindow = async (from: string, to: string) => {
        const { data, error } = await (supabase as any)
          .schema("crm")
          .from(tableName)
          .select("date_start, spend_cents, impressions, clicks, purchases_count, purchases_value_cents")
          .eq("company_id", row.company_id)
          .eq(idCol, idValue)
          .gte("date_start", from)
          .lte("date_start", to);
        if (error) throw new Error(`insights_query: ${error.message}`);
        return aggregate((data ?? []) as InsightRow[]);
      };

      const aggBefore = await fetchWindow(beforeFrom, beforeTo);
      const aggAfter = await fetchWindow(afterFrom, afterTo);
      const mBefore = metricsOf(aggBefore);
      const mAfter = metricsOf(aggAfter);

      const delta = {
        spend_eur: mAfter.spend_eur - mBefore.spend_eur,
        revenue_eur: mAfter.revenue_eur - mBefore.revenue_eur,
        roas_abs: (mAfter.roas ?? 0) - (mBefore.roas ?? 0),
        ctr_abs_pct: (mAfter.ctr - mBefore.ctr) * 100,
        cpa_eur_abs: (mAfter.cpa_eur ?? 0) - (mBefore.cpa_eur ?? 0),
        purchases_abs: mAfter.purchases - mBefore.purchases,
      };

      const impactMetrics = {
        window: { before_from: beforeFrom, before_to: beforeTo, after_from: afterFrom, after_to: afterTo },
        entity: { table: tableName, id_col: idCol, id: idValue },
        before: mBefore,
        after: mAfter,
        delta,
        measured_at: new Date().toISOString(),
      };

      const { error: updErr } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_changes")
        .update({
          impact_measured_at: new Date().toISOString(),
          impact_metrics_jsonb: impactMetrics,
        })
        .eq("id", row.id);
      if (updErr) throw new Error(`update: ${updErr.message}`);

      results.push({ id: row.id, ok: true, metrics: { roas_abs: delta.roas_abs, spend_eur: delta.spend_eur } });
    } catch (e) {
      results.push({ id: row.id, ok: false, error: (e as Error).message.slice(0, 200) });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return json({
    processed: pending.length,
    ok: okCount,
    failed: pending.length - okCount,
    results,
    completed_at: new Date().toISOString(),
  });
});
