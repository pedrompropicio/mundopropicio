// Queries do Google Ads para o dashboard unificado (Fase 3B).
// Normalizam crm.google_campaign e crm.google_campaign_insights_daily para a
// MESMA forma das linhas do Meta (CampaignRow / InsightRow) com platform="google",
// para que aggregate() e a tabela sirvam as duas plataformas sem ramificações.
//
// Métricas que o Google não fornece (alcance, frequência, cliques únicos,
// ViewContent, AddToCart, InitiateCheckout) ficam NULL — a UI mostra "—",
// nunca zero.
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { lisbonToday } from "@/lib/date-lisbon";
import type { CampaignRow, InsightRow } from "@/components/crm/dashboard/types";

const MICROS_PER_CENT = 10_000;

/** ENABLED/PAUSED/REMOVED do Google → vocabulário do dashboard (ACTIVE/PAUSED/…). */
function normalizeStatus(s: string | null): string | null {
  if (!s) return null;
  if (s === "ENABLED") return "ACTIVE";
  if (s === "PAUSED") return "PAUSED";
  return s;
}

export function useGoogleCampaignsQuery(opts: {
  companyId: string | null | undefined;
  enabled: boolean;
}) {
  const { companyId, enabled } = opts;
  return useQuery({
    queryKey: ["crm-google-campaigns", companyId],
    enabled: enabled && !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("google_campaign")
        .select(
          "id, connection_id, customer_id, external_campaign_id, name, status, advertising_channel_type, " +
            "bidding_strategy_type, budget_amount_micros, start_date, end_date, last_synced_at, " +
            "linked_event_id, linked_event_locked",
        )
        .eq("company_id", companyId)
        .order("last_synced_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).map((r: any): CampaignRow => ({
        id: r.id,
        connection_id: r.connection_id,
        ad_account_id: r.customer_id ?? "",
        external_campaign_id: r.external_campaign_id,
        name: r.name ?? r.external_campaign_id,
        status: normalizeStatus(r.status),
        effective_status: normalizeStatus(r.status),
        objective: r.advertising_channel_type ?? null,
        daily_budget_cents:
          r.budget_amount_micros != null
            ? Math.round(Number(r.budget_amount_micros) / MICROS_PER_CENT)
            : null,
        lifetime_budget_cents: null,
        start_time: r.start_date ?? null,
        stop_time: r.end_date ?? null,
        updated_time: r.last_synced_at ?? null,
        last_synced_at: r.last_synced_at ?? "",
        linked_event_id: r.linked_event_id ?? null,
        linked_event_locked: r.linked_event_locked ?? false,
        currency: null,
        bid_strategy: r.bidding_strategy_type ?? null,
        replaced_by_strategy_id: null,
        platform: "google",
        channel_type: r.advertising_channel_type ?? null,
      })) as CampaignRow[];
    },
  });
}

/** Insights diários do Google (janela de 60 dias, fuso de Lisboa) na forma do Meta. */
export function useGoogleInsightsQuery(opts: {
  companyId: string | null | undefined;
  enabled: boolean;
}) {
  const { companyId, enabled } = opts;
  return useQuery({
    queryKey: ["crm-google-insights", companyId],
    enabled: enabled && !!companyId,
    queryFn: async () => {
      const sixtyAgo = subDays(lisbonToday(), 60);
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("google_campaign_insights_daily")
        .select(
          "external_campaign_id, date_start, spend_cents, cpc_cents, cpm_cents, ctr, impressions, clicks, " +
            "conversions, conversions_value_cents, currency, last_synced_at",
        )
        .eq("company_id", companyId)
        .gte("date_start", format(sixtyAgo, "yyyy-MM-dd"));
      if (error) throw error;
      return (data ?? []).map((r: any): InsightRow => ({
        external_campaign_id: r.external_campaign_id,
        date_start: r.date_start,
        spend_cents: r.spend_cents ?? 0,
        cpc_cents: r.cpc_cents != null ? Math.round(Number(r.cpc_cents)) : null,
        ctr: r.ctr != null ? Number(r.ctr) : null,
        impressions: r.impressions ?? 0,
        clicks: r.clicks ?? 0,
        purchases_count: r.conversions != null ? Number(r.conversions) : 0,
        purchases_value_cents: r.conversions_value_cents ?? 0,
        frequency: null,
        currency: r.currency ?? null,
        last_synced_at: r.last_synced_at ?? "",
        // Sem equivalente no Google → null (a UI mostra "—", nunca 0).
        reach: null,
        unique_clicks: null,
        unique_ctr: null,
        cpm_cents: r.cpm_cents != null ? Math.round(Number(r.cpm_cents)) : null,
        cpp_cents: null,
        view_content_count: null,
        add_to_cart_count: null,
        initiate_checkout_count: null,
        platform: "google",
      })) as InsightRow[];
    },
  });
}
