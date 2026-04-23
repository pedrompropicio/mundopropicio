// Helpers and shared types for the Camarim (Dressing Room) module.

export type CamarimSessionMode = "single_event" | "tour_consolidated" | "city_session";

export type CamarimSessionStatus = "open" | "in_review" | "closed" | "integrated";

export type CamarimItemPaymentOrigin = "advance" | "card" | "out_of_pocket";

export type CamarimItemBpScope = "master_common" | "local_city";

export type CamarimItemStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "integrated"
  | "pending_review";

export type CamarimFundMoveType = "advance" | "reinforcement" | "refund" | "adjustment";

export const SESSION_MODE_LABELS: Record<CamarimSessionMode, string> = {
  single_event: "Evento único",
  tour_consolidated: "Turnê consolidada",
  city_session: "Sessão por cidade",
};

export const SESSION_MODE_DESCRIPTIONS: Record<CamarimSessionMode, string> = {
  single_event: "Um show / evento isolado.",
  tour_consolidated: "Uma única sessão para toda a turnê. Orçamento consolidado.",
  city_session: "Uma sessão por cidade da turnê. Orçamento por evento local.",
};

export const SESSION_STATUS_LABELS: Record<CamarimSessionStatus, string> = {
  open: "Aberta",
  in_review: "Em revisão",
  closed: "Fechada",
  integrated: "Integrada",
};

export const SESSION_STATUS_VARIANTS: Record<CamarimSessionStatus, string> = {
  open: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  in_review: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  closed: "bg-slate-500/15 text-slate-600 border-slate-500/30",
  integrated: "bg-primary/15 text-primary border-primary/30",
};

export const PAYMENT_ORIGIN_LABELS: Record<CamarimItemPaymentOrigin, string> = {
  advance: "Adiantamento (caixa do camarim)",
  card: "Cartão da empresa",
  out_of_pocket: "Pago do bolso (a reembolsar)",
};

export const BP_SCOPE_LABELS: Record<CamarimItemBpScope, string> = {
  master_common: "BP Master (rateio comum)",
  local_city: "BP Local (cidade)",
};

export const FUND_MOVE_LABELS: Record<CamarimFundMoveType, string> = {
  advance: "Adiantamento inicial",
  reinforcement: "Reforço de caixa",
  refund: "Devolução de saldo",
  adjustment: "Ajuste",
};

export const ITEM_STATUS_LABELS: Record<CamarimItemStatus, string> = {
  draft: "Rascunho",
  submitted: "Submetido",
  approved: "Aprovado",
  rejected: "Rejeitado",
  integrated: "Integrado",
  pending_review: "Parqueado (sem doc.)",
};

export const ITEM_STATUS_VARIANTS: Record<CamarimItemStatus, string> = {
  draft: "bg-slate-500/15 text-slate-600 border-slate-500/30",
  submitted: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  approved: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  integrated: "bg-primary/15 text-primary border-primary/30",
  pending_review: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

export function formatCurrency(amount: number, currency = "EUR") {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(amount ?? 0);
}
