// Painel de impacto nas vendas (MP Audience).
//
// Compara a série diária de bilhetes vendidos (public.ticketline_daily_sales,
// fonte de verdade da bilheteira) com o investimento diário por plataforma.
//
// AVISO CONCEITUAL: a diferença entre a média de bilhetes/dia depois do
// arranque e a média antes é uma **variação após o arranque** — correlação,
// não experiência controlada. Nunca chamar "incremental" nem "vendas geradas
// pela campanha": ao mesmo tempo acontecem imprensa, abertura de vendas e
// outras plataformas. Ver docs/features/mp-audience-dashboard.md.
import { addDays, differenceInDays, format, parseISO } from "date-fns";
import type { InsightRow } from "@/components/crm/dashboard/types";

export interface DailySaleRow {
  sale_date: string;
  quantity: number | string | null;
  total_value: number | string | null;
}

export interface SalesImpactPoint {
  /** yyyy-MM-dd (Europe/Lisbon, tal como vem da bilheteira). */
  date: string;
  /** dd/MM para o eixo. */
  label: string;
  /** Bilhetes vendidos no dia. `null` = sem registo (lacuna, não zero). */
  tickets: number | null;
  /** Receita de bilheteira do dia, em unidades monetárias. */
  revenue: number | null;
  /** Investimento Meta do dia, em unidades monetárias. `null` = sem dados. */
  metaSpend: number | null;
  /** Investimento Google do dia, em unidades monetárias. `null` = sem dados. */
  googleSpend: number | null;
}

export interface SalesImpactSummary {
  /** Primeiro dia com spend > 0 por plataforma (yyyy-MM-dd) ou null. */
  metaStart: string | null;
  googleStart: string | null;
  /** O mais antigo dos dois arranques. */
  firstStart: string | null;
  /** Médias de bilhetes/dia antes e depois do arranque. */
  beforeAvgTickets: number | null;
  afterAvgTickets: number | null;
  /** afterAvg / beforeAvg (null se não há base). */
  multiplier: number | null;
  daysBefore: number;
  daysAfter: number;
  /** Bilhetes e receita no período depois do arranque. */
  ticketsAfter: number;
  revenueAfter: number;
  /** Investimento total (todas as plataformas) depois do arranque, em unidades monetárias. */
  spendAfter: number;
  /** Compras que as plataformas reportam no período depois. */
  reportedPurchases: number;
  /** reportedPurchases / ticketsAfter (fracção) ou null. */
  capturedShare: number | null;
}

/** Constrói a série contínua diária de vendas + investimento por plataforma. */
export function buildSalesImpactSeries(
  sales: DailySaleRow[],
  insights: InsightRow[],
  from: Date,
  to: Date,
): SalesImpactPoint[] {
  const salesByDay = new Map<string, { tickets: number; revenue: number }>();
  for (const s of sales) {
    if (!s.sale_date) continue;
    const cur = salesByDay.get(s.sale_date) ?? { tickets: 0, revenue: 0 };
    cur.tickets += Number(s.quantity ?? 0);
    cur.revenue += Number(s.total_value ?? 0);
    salesByDay.set(s.sale_date, cur);
  }

  const spendByDay = new Map<string, { meta: number | null; google: number | null }>();
  for (const r of insights) {
    if (!r.date_start) continue;
    const cur = spendByDay.get(r.date_start) ?? { meta: null, google: null };
    const key = (r.platform ?? "meta") === "google" ? "google" : "meta";
    cur[key] = (cur[key] ?? 0) + (r.spend_cents ?? 0) / 100;
    spendByDay.set(r.date_start, cur);
  }

  const total = Math.max(0, differenceInDays(to, from)) + 1;
  const out: SalesImpactPoint[] = [];
  for (let i = 0; i < total; i++) {
    const d = addDays(from, i);
    const iso = format(d, "yyyy-MM-dd");
    const s = salesByDay.get(iso);
    const sp = spendByDay.get(iso);
    out.push({
      date: iso,
      label: format(d, "dd/MM"),
      tickets: s ? s.tickets : null,
      revenue: s ? s.revenue : null,
      metaSpend: sp?.meta ?? null,
      googleSpend: sp?.google ?? null,
    });
  }
  return out;
}

/** Leitura em números da série: arranques, médias antes/depois e captação. */
export function computeSalesImpact(
  points: SalesImpactPoint[],
  insights: InsightRow[],
): SalesImpactSummary {
  const metaStart =
    points.find((p) => (p.metaSpend ?? 0) > 0)?.date ?? null;
  const googleStart =
    points.find((p) => (p.googleSpend ?? 0) > 0)?.date ?? null;
  const firstStart =
    metaStart && googleStart
      ? metaStart < googleStart
        ? metaStart
        : googleStart
      : (metaStart ?? googleStart);

  let ticketsBefore = 0;
  let daysBefore = 0;
  let ticketsAfter = 0;
  let daysAfter = 0;
  let revenueAfter = 0;
  let spendAfter = 0;

  for (const p of points) {
    const isAfter = firstStart != null && p.date >= firstStart;
    if (isAfter) {
      spendAfter += (p.metaSpend ?? 0) + (p.googleSpend ?? 0);
    }
    if (p.tickets == null) continue;
    if (firstStart == null || !isAfter) {
      ticketsBefore += p.tickets;
      daysBefore += 1;
    } else {
      ticketsAfter += p.tickets;
      revenueAfter += p.revenue ?? 0;
      daysAfter += 1;
    }
  }

  let reportedPurchases = 0;
  for (const r of insights) {
    if (!r.date_start) continue;
    if (firstStart != null && r.date_start < firstStart) continue;
    reportedPurchases += r.purchases_count ?? 0;
  }

  const beforeAvgTickets = daysBefore > 0 ? ticketsBefore / daysBefore : null;
  const afterAvgTickets = daysAfter > 0 ? ticketsAfter / daysAfter : null;

  return {
    metaStart,
    googleStart,
    firstStart,
    beforeAvgTickets,
    afterAvgTickets,
    multiplier:
      beforeAvgTickets != null && beforeAvgTickets > 0 && afterAvgTickets != null
        ? afterAvgTickets / beforeAvgTickets
        : null,
    daysBefore,
    daysAfter,
    ticketsAfter,
    revenueAfter,
    spendAfter,
    reportedPurchases,
    capturedShare: ticketsAfter > 0 ? reportedPurchases / ticketsAfter : null,
  };
}

/** Janela do painel: `days` de análise mais um colchão para a linha de base. */
export function salesImpactWindow(today: Date, days: number): { from: Date; to: Date } {
  const span = Math.max(days, 60);
  return { from: addDays(today, -(span - 1)), to: today };
}

/** Igual a parseISO, mas tolerante a null (usado nos tooltips). */
export function safeParseISO(iso: string | null): Date | null {
  return iso ? parseISO(iso) : null;
}
