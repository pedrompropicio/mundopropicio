// Série diária do Dashboard MP Audience (Fase 2).
// Constrói um ponto por dia do período seleccionado — dias sem dados ficam
// com valores `null` (lacuna identificada), NUNCA zero, para o gráfico
// mostrar um buraco em vez de fingir um dia sem investimento.
import { addDays, differenceInDays, format } from "date-fns";
import type { InsightRow } from "@/components/crm/dashboard/types";

export interface DailyPoint {
  /** yyyy-MM-dd (fuso de Lisboa, tal como vem do Meta). */
  date: string;
  /** dd/MM para o eixo. */
  label: string;
  hasData: boolean;
  /** Em unidades monetárias (não cêntimos) — o eixo é dinheiro. */
  spend: number | null;
  revenue: number | null;
  roas: number | null;
  purchases: number | null;
  /** Em unidades monetárias. */
  cpa: number | null;
  /** Decimal (0.0123 = 1,23%). */
  ctr: number | null;
}

/** Agrega os insights por dia e devolve a série contínua do período. */
export function buildDailySeries(rows: InsightRow[], from: Date, to: Date): DailyPoint[] {
  const acc = new Map<
    string,
    { spend: number; revenue: number; purchases: number; clicks: number; impressions: number }
  >();
  for (const r of rows) {
    if (!r.date_start) continue;
    const cur =
      acc.get(r.date_start) ?? { spend: 0, revenue: 0, purchases: 0, clicks: 0, impressions: 0 };
    cur.spend += r.spend_cents ?? 0;
    cur.revenue += r.purchases_value_cents ?? 0;
    cur.purchases += r.purchases_count ?? 0;
    cur.clicks += r.clicks ?? 0;
    cur.impressions += r.impressions ?? 0;
    acc.set(r.date_start, cur);
  }

  const total = Math.max(0, differenceInDays(to, from)) + 1;
  const out: DailyPoint[] = [];
  for (let i = 0; i < total; i++) {
    const d = addDays(from, i);
    const iso = format(d, "yyyy-MM-dd");
    const a = acc.get(iso);
    if (!a) {
      out.push({
        date: iso,
        label: format(d, "dd/MM"),
        hasData: false,
        spend: null,
        revenue: null,
        roas: null,
        purchases: null,
        cpa: null,
        ctr: null,
      });
      continue;
    }
    const spend = a.spend / 100;
    const revenue = a.revenue / 100;
    out.push({
      date: iso,
      label: format(d, "dd/MM"),
      hasData: true,
      spend,
      revenue,
      roas: a.spend > 0 ? a.revenue / a.spend : null,
      purchases: a.purchases,
      cpa: a.purchases > 0 ? spend / a.purchases : null,
      ctr: a.impressions > 0 ? a.clicks / a.impressions : null,
    });
  }
  return out;
}

/** Marcas em números redondos (1/2/5 × 10^n) até ao máximo da série. */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const rawStep = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}
