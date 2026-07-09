export type CardSessionStatus = "open" | "in_review" | "closed";

export const CARD_SESSION_STATUS_LABELS: Record<CardSessionStatus, string> = {
  open: "Aberta",
  in_review: "Em revisão",
  closed: "Fechada",
};

export const CARD_SESSION_STATUS_VARIANTS: Record<CardSessionStatus, string> = {
  open: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  in_review: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  closed: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export function formatCurrency(value: number, currency = "EUR"): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export const RECHARGE_CATEGORY_CODE = "10.3"; // transferência entre contas
