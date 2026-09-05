// Tipos e helpers do módulo Pipeline de Patrocínios (CRM)
export type SponsorshipStage =
  | "lead"
  | "contacted"
  | "proposal_sent"
  | "negotiating"
  | "closed"
  | "barter"
  | "lost";

export type SponsorshipDocStatus =
  | "awaiting"
  | "invoice_sent"
  | "invoice_received"
  | "post_event";

export type SponsorshipActivityKind =
  | "note"
  | "stage_change"
  | "doc_status_change"
  | "sync"
  | "system";

export interface SponsorshipPipelineRow {
  id: string;
  company_id: string;
  event_id: string;
  supplier_id: string | null;
  supplier_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  stage: SponsorshipStage;
  doc_status: SponsorshipDocStatus | null;
  proposed_amount: number;
  confirmed_amount: number;
  currency: string;
  iva_rate: number;
  is_barter: boolean;
  barter_description: string | null;
  priority: "low" | "medium" | "high";
  owner_user_id: string | null;
  next_followup_date: string | null;
  notes: string | null;
  lost_reason: string | null;
  closed_at: string | null;
  auto_sync_bp: boolean;
  /** segmento de patrocínio (D22) — null nos cards anteriores */
  segment_id?: string | null;

  linked_forecast_id: string | null;
  linked_transaction_id: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SponsorshipActivityRow {
  id: string;
  company_id: string;
  pipeline_id: string;
  user_id: string | null;
  kind: SponsorshipActivityKind;
  body: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

export const STAGE_ORDER: SponsorshipStage[] = [
  "lead",
  "contacted",
  "proposal_sent",
  "negotiating",
  "closed",
  "barter",
  "lost",
];

export const STAGE_LABELS: Record<SponsorshipStage, string> = {
  lead: "Lead",
  contacted: "Contactado",
  proposal_sent: "Proposta enviada",
  negotiating: "Em negociação",
  closed: "Fechado",
  barter: "Permuta",
  lost: "Perdido",
};

export const STAGE_COLORS: Record<SponsorshipStage, string> = {
  lead: "bg-muted text-muted-foreground",
  contacted: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  proposal_sent: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  negotiating: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  closed: "bg-primary/15 text-primary border-primary/30",
  barter: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  lost: "bg-destructive/15 text-destructive border-destructive/30",
};

export const DOC_STATUS_LABELS: Record<SponsorshipDocStatus, string> = {
  awaiting: "A aguardar",
  invoice_sent: "Fatura enviada",
  invoice_received: "Fatura recebida",
  post_event: "Pós-evento",
};

export const PRIORITY_LABELS = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
} as const;

export function effectiveAmount(row: Pick<SponsorshipPipelineRow, "stage" | "proposed_amount" | "confirmed_amount">) {
  if (row.stage === "closed" || row.stage === "barter") return Number(row.confirmed_amount || 0);
  return Number(row.proposed_amount || 0);
}

export function isClosedStage(stage: SponsorshipStage) {
  return stage === "closed" || stage === "barter";
}
