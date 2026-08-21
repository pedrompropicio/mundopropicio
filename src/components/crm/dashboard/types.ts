// Tipos partilhados do Dashboard Meta Live.
// Extraídos de src/pages/crm/Campaigns.tsx (Fase 0 — refactor puramente estrutural).

// ============================================================
// Types
// ============================================================
export interface CampaignRow {
  id: string;
  connection_id: string;
  ad_account_id: string;
  external_campaign_id: string;
  name: string;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
  start_time: string | null;
  stop_time: string | null;
  updated_time: string | null;
  last_synced_at: string;
  linked_event_id: string | null;
  linked_event_locked: boolean | null;
  currency: string | null;
  bid_strategy: string | null;
  replaced_by_strategy_id: string | null; // Sprint 3a-1 — marca campanha substituída por redesign
}

export interface InsightRow {
  external_campaign_id: string;
  date_start: string;
  spend_cents: number | null;
  cpc_cents: number | null;
  ctr: number | null;
  impressions: number | null;
  clicks: number | null;
  purchases_count: number | null;
  purchases_value_cents: number | null;
  frequency: number | null;
  currency: string | null;
  last_synced_at: string;
}

export interface ConnectionRow {
  id: string;
  status: string;
  selected_ad_account_id: string | null;
  selected_ad_account_name: string | null;
  selected_ad_account_currency: string | null;
  last_validated_at: string | null;
}

export interface EventRow {
  id: string;
  name: string;
  date: string | null;
  status: string;
  tickets_total: number | null;
  tickets_sold: number | null;
  event_type: string | null;       // 'simple' | 'tour_master' | 'tour_split'
  parent_event_id: string | null;  // null for simple/master; master id for split
}

// Dashboard hierárquico: simple events vs tour families (master + splits).
export type SimpleGroup = { kind: "simple"; event: EventRow; campaigns: CampaignRow[] };
export type TourGroup = {
  kind: "tour";
  master: EventRow;
  splits: EventRow[];
  campaignsBySplit: Map<string, CampaignRow[]>;
  masterCampaigns: CampaignRow[]; // campanhas linkadas ao master directamente (não atribuídas a split)
};
export type DashboardGroup = SimpleGroup | TourGroup;
