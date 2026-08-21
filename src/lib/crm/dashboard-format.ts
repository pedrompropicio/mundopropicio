// Formatadores e bandas de cor do Dashboard Meta Live.
// Extraídos de src/pages/crm/Campaigns.tsx (Fase 0 — sem mudança de comportamento).
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatMoney } from "@/lib/currency";
import type { EventRow } from "@/components/crm/dashboard/types";

// ============================================================
// Helpers
// ============================================================
export function formatCurrency(cents: number | null | undefined, currency?: string | null): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "—";
  // Canonical formatter: locale derives from currency (BRL→pt-BR, etc).
  // Falls back to EUR when currency is missing (preserves legacy output).
  return formatMoney(cents, currency, { fromCents: true });
}
export function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
export function formatPercent(decimal: number | null | undefined, withSign = true): string {
  if (decimal === null || decimal === undefined || !Number.isFinite(decimal)) return "—";
  const pct = decimal * 100;
  const sign = withSign && pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
export function formatRoas(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}x`;
}
// Bandas para CAMPANHA INDIVIDUAL (avaliação por fase do funil — ROAS individual não é a meta principal).
export function roasColor(roas: number | null | undefined): string {
  if (roas === null || roas === undefined) return "text-muted-foreground";
  if (roas >= 2) return "text-emerald-500";
  if (roas >= 1) return "text-amber-500";
  return "text-red-500";
}
export function roasBadgeClass(roas: number | null | undefined): string {
  if (roas === null || roas === undefined) return "bg-muted text-muted-foreground";
  if (roas >= 2) return "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30";
  if (roas >= 1) return "bg-amber-500/15 text-amber-500 border border-amber-500/30";
  return "bg-red-500/15 text-red-500 border border-red-500/30";
}

// Banda do ROAS BLENDED por EVENTO (target Mundo Propício = 8x agregado).
export const EVENT_TARGET_ROAS = 8;
export function roasColorByEvent(roas: number | null | undefined): string {
  if (roas === null || roas === undefined) return "text-muted-foreground";
  if (roas >= 8) return "text-emerald-500";
  if (roas >= 6) return "text-amber-500";
  if (roas >= 4) return "text-orange-500";
  return "text-red-500";
}
export function roasBadgeClassByEvent(roas: number | null | undefined): string {
  if (roas === null || roas === undefined) return "bg-muted text-muted-foreground";
  if (roas >= 8) return "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30";
  if (roas >= 6) return "bg-amber-500/15 text-amber-500 border border-amber-500/30";
  if (roas >= 4) return "bg-orange-500/15 text-orange-500 border border-orange-500/30";
  return "bg-red-500/15 text-red-500 border border-red-500/30";
}
export function roasBarBgByEvent(roas: number | null | undefined): string {
  if (roas === null || roas === undefined) return "bg-muted-foreground";
  if (roas >= 8) return "bg-emerald-500";
  if (roas >= 6) return "bg-amber-500";
  if (roas >= 4) return "bg-orange-500";
  return "bg-red-500";
}

// Range de datas a partir das splits de um tour_master.
// Devolve "dd-dd MMM yyyy · N datas" quando há mais de uma data; "dd MMM yyyy" para uma só.
export function formatTourDateRange(splits: EventRow[]): string | null {
  const datesIso = splits.map((s) => s.date).filter((d): d is string => !!d);
  if (datesIso.length === 0) return null;
  const dates = datesIso.map((d) => parseISO(d)).sort((a, b) => a.getTime() - b.getTime());
  const count = dates.length;
  const first = dates[0];
  const last = dates[count - 1];
  if (count === 1) return `${format(first, "dd MMM yyyy", { locale: ptBR })} · 1 data`;
  if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
    return `${format(first, "dd", { locale: ptBR })}–${format(last, "dd MMM yyyy", { locale: ptBR })} · ${count} datas`;
  }
  return `${format(first, "dd MMM", { locale: ptBR })} → ${format(last, "dd MMM yyyy", { locale: ptBR })} · ${count} datas`;
}
