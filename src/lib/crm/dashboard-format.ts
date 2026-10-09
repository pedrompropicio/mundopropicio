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

// Banda do ROAS BLENDED por EVENTO. A meta vem SÓ de public.events.target_roas;
// NULL = sem meta (sem padrão): cor neutra, sem avisos nem barra de progresso.
/** Meta de ROAS do evento, ou null quando o evento não tem meta definida. */
export function eventTargetRoas(event: { target_roas?: number | null } | null | undefined): number | null {
  const t = event?.target_roas;
  return t != null && Number.isFinite(Number(t)) && Number(t) > 0 ? Number(t) : null;
}
// Bandas relativas à meta: ≥ meta verde; ≥ 75% âmbar; ≥ 50% laranja; abaixo vermelho.
function roasBand(roas: number | null | undefined, target: number | null | undefined): "none" | "ok" | "warn" | "low" | "bad" {
  if (roas === null || roas === undefined) return "none";
  if (target == null || !(target > 0)) return "none";
  if (roas >= target) return "ok";
  if (roas >= target * 0.75) return "warn";
  if (roas >= target * 0.5) return "low";
  return "bad";
}
export function roasColorByEvent(roas: number | null | undefined, target?: number | null): string {
  if (roas === null || roas === undefined) return "text-muted-foreground";
  return { none: "text-foreground", ok: "text-emerald-500", warn: "text-amber-500", low: "text-orange-500", bad: "text-red-500" }[roasBand(roas, target)];
}
export function roasBadgeClassByEvent(roas: number | null | undefined, target?: number | null): string {
  return {
    none: "bg-muted text-muted-foreground",
    ok: "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30",
    warn: "bg-amber-500/15 text-amber-500 border border-amber-500/30",
    low: "bg-orange-500/15 text-orange-500 border border-orange-500/30",
    bad: "bg-red-500/15 text-red-500 border border-red-500/30",
  }[roasBand(roas, target)];
}
export function roasBarBgByEvent(roas: number | null | undefined, target?: number | null): string {
  return { none: "bg-muted-foreground", ok: "bg-emerald-500", warn: "bg-amber-500", low: "bg-orange-500", bad: "bg-red-500" }[roasBand(roas, target)];
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
