// D-ERP248 — TikTok Ads no dashboard unificado. Normaliza crm.tiktok_campaign e
// crm.tiktok_insights_daily (nível 'adgroup', o que os relatórios somam) para a
// forma do Meta com platform="tiktok". Só campanhas ligadas a eventos DA empresa.
// Cêntimos; nunca converter moeda; métricas sem equivalente ficam null ("—").
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { lisbonToday } from "@/lib/date-lisbon";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import type { CampaignRow, InsightRow } from "@/components/crm/dashboard/types";

function normalizeStatus(s: string | null): string | null {
  if (!s) return null;
  if (s === "ENABLE" || s === "CAMPAIGN_STATUS_ENABLE") return "ACTIVE";
  if (s === "DISABLE" || s === "CAMPAIGN_STATUS_DISABLE") return "PAUSED";
  return s;
}

export function mapTiktokCampaign(r: any): CampaignRow {
  return {
    id: r.id,
    connection_id: r.connection_id,
    ad_account_id: r.connection_id,
    external_campaign_id: r.external_campaign_id,
    name: r.name ?? r.external_campaign_id,
    status: normalizeStatus(r.status),
    effective_status: normalizeStatus(r.status),
    objective: r.objective ?? null,
    daily_budget_cents: r.budget_cents ?? null,
    lifetime_budget_cents: null,
    start_time: null,
    stop_time: null,
    updated_time: r.last_synced_at ?? null,
    last_synced_at: r.last_synced_at ?? "",
    linked_event_id: r.linked_event_id ?? null,
    linked_event_locked: r.linked_event_locked ?? false,
    currency: r.currency ?? null,
    bid_strategy: null,
    replaced_by_strategy_id: null,
    platform: "tiktok",
  };
}

export function mapTiktokInsight(r: any): InsightRow {
  const spend = r.spend_cents ?? 0;
  const clicks = r.clicks ?? 0;
  const imps = r.impressions ?? 0;
  return {
    external_campaign_id: r.external_campaign_id,
    date_start: r.date_start,
    spend_cents: spend,
    cpc_cents: clicks > 0 ? Math.round(spend / clicks) : null,
    ctr: imps > 0 ? clicks / imps : null,
    impressions: imps,
    clicks,
    purchases_count: null,
    purchases_value_cents: null,
    frequency: null,
    currency: r.currency ?? null,
    last_synced_at: r.recorded_at ?? "",
    reach: null,
    unique_clicks: null,
    unique_ctr: null,
    cpm_cents: imps > 0 ? Math.round((spend * 1000) / imps) : null,
    cpp_cents: null,
    view_content_count: r.view_content ?? null,
    add_to_cart_count: null,
    initiate_checkout_count: null,
    platform: "tiktok",
  };
}

export function useTiktokCampaignsQuery(opts: { companyId: string | null | undefined; enabled: boolean }) {
  const { companyId, enabled } = opts;
  return useQuery({
    queryKey: ["crm-tiktok-campaigns", companyId],
    enabled: enabled && !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).schema("crm").from("tiktok_campaign")
        .select("id, connection_id, external_campaign_id, name, status, objective, budget_cents, currency, last_synced_at, linked_event_id, linked_event_locked")
        .not("linked_event_id", "is", null);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const ids = [...new Set(rows.map((r) => r.linked_event_id))];
      if (!ids.length) return [] as CampaignRow[];
      const { data: evs, error: ee } = await supabase.from("events").select("id").in("id", ids).eq("company_id", companyId!);
      if (ee) throw ee;
      const own = new Set((evs ?? []).map((e: any) => e.id));
      return rows.filter((r) => own.has(r.linked_event_id)).map(mapTiktokCampaign);
    },
  });
}

export function useTiktokInsightsQuery(opts: {
  companyId: string | null | undefined;
  campaigns: CampaignRow[] | undefined;
  enabled: boolean;
}) {
  const { companyId, campaigns, enabled } = opts;
  const ids = (campaigns ?? []).map((c) => c.external_campaign_id).sort();
  return useQuery({
    queryKey: ["crm-tiktok-insights", companyId, ids.join(",")],
    enabled: enabled && !!companyId && ids.length > 0,
    queryFn: async () => {
      const since = format(subDays(lisbonToday(), 60), "yyyy-MM-dd");
      const { data, error } = await fetchAllPagedQuery((supabase as any).schema("crm").from("tiktok_insights_daily")
        .select("external_campaign_id, date_start, spend_cents, impressions, clicks, view_content, currency, recorded_at")
        .eq("level", "adgroup")
        .in("external_campaign_id", ids)
        .gte("date_start", since)
        .order("date_start"));
      if (error) throw error;
      return ((data ?? []) as any[]).map(mapTiktokInsight);
    },
  });
}
