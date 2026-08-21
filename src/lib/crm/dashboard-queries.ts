// Queries do Dashboard Meta Live — extraídas de src/pages/crm/Campaigns.tsx.
// Fase 0: mesmas queryKey, mesmas colunas, mesma lógica. Sem mudança de comportamento.
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { lisbonToday } from "@/lib/date-lisbon";
import type { BudgetMode } from "@/components/crm/dashboard/budget-mode-context";
import type { CampaignRow, EventRow, InsightRow } from "@/components/crm/dashboard/types";

export interface AdsetBudgetRow {
  external_campaign_id: string;
  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
}

// ---------- Campaigns ----------
export function useCampaignsQuery(opts: {
  companyId: string | null | undefined;
  adAccountId: string | null | undefined;
  enabled: boolean;
}) {
  const { companyId, adAccountId, enabled } = opts;
  return useQuery({
    queryKey: ["crm-meta-campaigns", companyId, adAccountId],
    enabled: enabled && !!companyId && !!adAccountId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_snapshot")
        .select("*")
        .eq("ad_account_id", adAccountId)
        .order("updated_time", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
  });
}

// ---------- Adset budgets (apenas p/ derivar ABO/CBO real por campanha) ----------
// Critério canónico replicado de CampaignView.tsx L766-787:
// CBO ⇔ campanha tem budget>0; ABO ⇔ soma de budgets dos adsets>0; senão unknown.
// Necessário porque o Meta devolve daily_budget_cents stale ao nível da campanha
// em ABO — não dá para confiar só em campaigns.daily_budget_cents.
export function useAdsetBudgetsQuery(opts: {
  companyId: string | null | undefined;
  adAccountId: string | null | undefined;
  enabled: boolean;
}) {
  const { companyId, adAccountId, enabled } = opts;
  return useQuery({
    queryKey: ["crm-meta-adset-budgets", companyId, adAccountId],
    enabled: enabled && !!companyId && !!adAccountId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_adset_snapshot")
        .select("external_campaign_id, daily_budget_cents, lifetime_budget_cents")
        .eq("ad_account_id", adAccountId);
      if (error) throw error;
      return (data ?? []) as AdsetBudgetRow[];
    },
  });
}

/** Mapa external_campaign_id → ABO/CBO/unknown (ABO ganha sobre budget stale). */
export function buildBudgetModeMap(
  campaigns: CampaignRow[] | undefined,
  adsetBudgetRows: AdsetBudgetRow[] | undefined,
): Map<string, BudgetMode> {
  const adsetSums = new Map<string, number>();
  for (const r of adsetBudgetRows ?? []) {
    const sum = (r.daily_budget_cents ?? 0) + (r.lifetime_budget_cents ?? 0);
    adsetSums.set(r.external_campaign_id, (adsetSums.get(r.external_campaign_id) ?? 0) + sum);
  }
  const map = new Map<string, BudgetMode>();
  for (const c of campaigns ?? []) {
    const campaignHasBudget = (c.daily_budget_cents ?? 0) > 0 || (c.lifetime_budget_cents ?? 0) > 0;
    const adsetsHaveBudget = (adsetSums.get(c.external_campaign_id) ?? 0) > 0;
    // Precedência: ABO ganha sobre budget stale na campanha (ver CampaignView L762-790).
    const mode: BudgetMode = adsetsHaveBudget ? "ABO" : campaignHasBudget ? "CBO" : "unknown";
    map.set(c.external_campaign_id, mode);
  }
  return map;
}

// ---------- Insights (janela de 60 dias, em fuso de Lisboa) ----------
export function useInsightsQuery(opts: {
  companyId: string | null | undefined;
  adAccountId: string | null | undefined;
  enabled: boolean;
  onFetched?: () => void;
}) {
  const { companyId, adAccountId, enabled, onFetched } = opts;
  return useQuery({
    queryKey: ["crm-meta-insights", companyId, adAccountId],
    enabled: enabled && !!companyId && !!adAccountId,
    queryFn: async () => {
      const sixtyAgo = subDays(lisbonToday(), 60);
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_insights_daily")
        .select(
          "external_campaign_id, date_start, spend_cents, cpc_cents, ctr, impressions, clicks, purchases_count, purchases_value_cents, frequency, currency, last_synced_at",
        )
        .eq("ad_account_id", adAccountId)
        .gte("date_start", format(sixtyAgo, "yyyy-MM-dd"));
      if (error) throw error;
      onFetched?.();
      return (data ?? []) as InsightRow[];
    },
  });
}

// ---------- Events for displayed campaigns (independente de status filter) ----------
// Inclui linked_event_ids de TODAS as campanhas (ACTIVE + PAUSED) para que o dashboard
// possa mostrar paused via statusFilter sem ter de re-fetch events.
export function useDashboardEventsQuery(opts: {
  linkedEventIds: string[];
  enabled: boolean;
}) {
  const { linkedEventIds, enabled } = opts;
  return useQuery({
    queryKey: ["crm-campaigns-events-tour", linkedEventIds.slice().sort().join(",")],
    enabled: enabled && linkedEventIds.length > 0,
    queryFn: async () => {
      const eventCols = "id, name, date, status, tickets_total, tickets_sold, event_type, parent_event_id";
      // Stage 1: events diretamente linkados às campanhas
      const { data: linkedData, error: err1 } = await supabase
        .from("events").select(eventCols).in("id", linkedEventIds);
      if (err1) throw err1;
      const linkedRows = (linkedData ?? []) as EventRow[];

      // Identificar masters envolvidos (linkados directamente OU pais de splits linkados)
      const masterIds = new Set<string>();
      for (const e of linkedRows) {
        if (e.event_type === "tour_master") masterIds.add(e.id);
        if (e.event_type === "tour_split" && e.parent_event_id) masterIds.add(e.parent_event_id);
      }
      if (masterIds.size === 0) return linkedRows;

      // Stage 2: para cada master envolvido, trazer o próprio master + TODAS as splits filhas
      // (mesmo as que não têm campanhas linkadas — para renderizar sub-card "Cidade Y · sem campanhas").
      const masterArr = [...masterIds];
      const masterArrCsv = masterArr.map((id) => `"${id}"`).join(",");
      const { data: familyData, error: err2 } = await supabase
        .from("events").select(eventCols)
        .or(`id.in.(${masterArrCsv}),parent_event_id.in.(${masterArrCsv})`);
      if (err2) throw err2;
      const familyRows = (familyData ?? []) as EventRow[];

      // Dedupe por id
      const m = new Map<string, EventRow>();
      for (const e of [...linkedRows, ...familyRows]) m.set(e.id, e);
      return [...m.values()];
    },
  });
}
