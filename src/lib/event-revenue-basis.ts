/**
 * SSoT da RECEITA do evento — DR-2026-09-06-D24.
 *
 * Uma única função devolve a receita de um evento (ou Master + Splits) em três
 * bases, sempre em base líquida (s/IVA) para previsto, e em par {net, gross}
 * para o realizado (o card e o Fecho têm seletor c/IVA na vista):
 *
 *   • `real`            — bilheteira de `ticket_sales` linha a linha (D11, IVA do
 *                         lote, sem arredondar por bloco) + transações
 *                         `type='income'` pelo filtro canónico do Fecho
 *                         (`isValidFechoTransaction`), com anti-duplicação por
 *                         PREFIXO de rubrica `1.1.01` quando há `ticket_sales`.
 *                         Sem `partially_paid`.
 *   • `currentForecast` — bilheteira via `computeLiveTicketForecast` (D21 adenda 2);
 *                         A&B via cenário forecast do módulo A&B (injectado pelo
 *                         hook, porque vive em hooks); patrocínios via
 *                         `computeSponsorshipSynthetic` (previsto corrente com
 *                         verbas, fechados sem verbas); outras receitas = linhas
 *                         de BP `type='income'` da versão activa não
 *                         representadas por sintéticas. `null` por componente
 *                         quando não há base.
 *   • `committed`       — "Previsto + excedido": por componente
 *                         `max(real, currentForecast ?? real)`. Espelha a regra
 *                         do custo: o previsto nunca fica abaixo do realizado.
 *
 * Consumidores: `useEventFinancialCardData`, `EventFecho`, `EventDetail`,
 * `useBPIncomeSynthetic` (real da bilheteira e dos patrocínios).
 */
import { supabase } from "@/integrations/supabase/client";
import { isValidFechoTransaction, isBilheteiraCategoryCode } from "@/lib/fecho-filters";
import { classifyIncomeL1 } from "@/lib/event-financial-card";
import { calcTotalWithIva } from "@/lib/iva";
import { computeLiveTicketForecast, type LiveTicketForecast } from "@/lib/event-simulator-forecast-live";
import {
  computeSponsorshipSynthetic,
  type SponsorshipSyntheticResult,
} from "@/lib/bp-sponsorship-synthetic";
import { fetchRootSettlements } from "@/hooks/useEventRootSettlements";
import { keepRootPerimeter } from "@/lib/settlement-perimeter";

export type RevenueBucket = "bilheteira" | "ab" | "patrocinio" | "outros";

export const REVENUE_BUCKETS: RevenueBucket[] = ["bilheteira", "ab", "patrocinio", "outros"];

export interface MoneyPair {
  net: number;
  gross: number;
}

export interface RevenueRealBasis {
  total: MoneyPair;
  buckets: Record<RevenueBucket, MoneyPair>;
  /** bilheteira vinda de ticket_sales (par exacto, linha a linha) */
  ticket: MoneyPair;
  hasTicketSales: boolean;
  /** transações de receita que efectivamente contaram (já sem as de 1.1.01 duplicadas) */
  incomeTx: any[];
  /** transações de receita excluídas por duplicarem a bilheteira */
  excludedTicketingTx: any[];
}

export interface RevenueForecastBasis {
  total: number | null;
  buckets: Record<RevenueBucket, number | null>;
}

export interface EventRevenueBasis {
  real: RevenueRealBasis;
  currentForecast: RevenueForecastBasis;
  /** Previsto + excedido (D24): por componente max(real, previsto corrente ?? real) */
  committed: { total: number; buckets: Record<RevenueBucket, number> };
  sponsorship: SponsorshipSyntheticResult;
  ticketForecast: LiveTicketForecast | null;
}

export interface EventRevenueBasisArgs {
  eventId: string;
  /** Master + Splits (ou só o sub seleccionado). Default: [eventId]. */
  eventIds?: string[];
  /**
   * Previsto corrente de A&B (cenário forecast do módulo A&B), s/IVA.
   * Vive em hooks (`useEventABScenarios`), por isso é injectado.
   * `null`/`undefined` = sem base.
   */
  abForecastNet?: number | null;
  /** Saltar o cálculo do previsto corrente (mais barato). Default false. */
  skipForecast?: boolean;
}

const zeroPair = (): MoneyPair => ({ net: 0, gross: 0 });
const emptyPairs = (): Record<RevenueBucket, MoneyPair> => ({
  bilheteira: zeroPair(),
  ab: zeroPair(),
  patrocinio: zeroPair(),
  outros: zeroPair(),
});

export interface TicketSalesTotals {
  eventId: string;
  quantity: number;
  gross: number;
  net: number;
}

/**
 * Totais de bilheteira por evento, somados NA BASE DE DADOS (#205).
 *
 * Nunca somar `ticket_sales` no cliente: o PostgREST corta aos 1.000 registos em
 * silêncio (foi o que deu 6.846 bilhetes em vez de 7.557 na Simone Mendes).
 * Líquido linha a linha pelo IVA do lote, exactamente como antes (D11).
 */
export async function fetchTicketSalesTotals(eventIds: string[]): Promise<TicketSalesTotals[]> {
  const ids = Array.from(new Set(eventIds.filter(Boolean)));
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc("get_event_ticket_sales_totals", {
    p_event_ids: ids,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    eventId: r.event_id as string,
    quantity: Number(r.quantity || 0),
    gross: Number(r.gross || 0),
    net: Number(r.net || 0),
  }));
}

/** Bilhetes vendidos (quantidade) dos eventos pedidos — mesma RPC. */
export async function fetchTicketSalesQty(eventIds: string[]): Promise<number> {
  const rows = await fetchTicketSalesTotals(eventIds);
  return rows.reduce((s, r) => s + r.quantity, 0);
}

/** Bilheteira realizada a partir de `ticket_sales`, linha a linha (D11). */
export async function fetchTicketSalesRevenue(eventIds: string[]): Promise<MoneyPair> {
  const rows = await fetchTicketSalesTotals(eventIds);
  return rows.reduce<MoneyPair>(
    (acc, r) => ({ net: acc.net + r.net, gross: acc.gross + r.gross }),
    zeroPair(),
  );
}

export async function computeEventRevenueBasis(
  args: EventRevenueBasisArgs,
): Promise<EventRevenueBasis> {
  const { eventId, abForecastNet = null, skipForecast = false } = args;
  const ids = Array.from(new Set([eventId, ...(args.eventIds ?? [])])).filter(Boolean);

  // ── REAL ─────────────────────────────────────────────────────────
  const [ticket, txRes, roots] = await Promise.all([
    fetchTicketSalesRevenue(ids),
    supabase
      .from("transactions")
      .select(
        "id, event_id, type, status, amount, iva_rate, category_id, is_transitory, exclude_from_result, reversed_at, is_hidden, description, event_settlement_id, account_categories(code, name)",
      )
      .in("event_id", ids)
      .eq("type", "income")
      .in("status", ["approved", "paid"]),
    fetchRootSettlements(ids),
  ]);

  // Perímetro da raiz (D25 g3): linhas marcadas com um fechamento filho são
  // exclusivas desse fechamento e não entram no resultado do evento.
  const allIncomeTx = keepRootPerimeter(
    ((txRes.data ?? []) as any[]).filter((t) => isValidFechoTransaction(t)),
    roots.rootIds,
  );
  const hasTicketSales = ticket.gross !== 0 || ticket.net !== 0;

  // Anti-duplicação: com ticket_sales, as TX da rubrica 1.1.01 (e descendentes)
  // são o MESMO dinheiro. Exclusão por PREFIXO de rubrica, nunca por descrição.
  const excludedTicketingTx = hasTicketSales
    ? allIncomeTx.filter((t) => isBilheteiraCategoryCode(t.account_categories?.code))
    : [];
  const incomeTx = hasTicketSales
    ? allIncomeTx.filter((t) => !isBilheteiraCategoryCode(t.account_categories?.code))
    : allIncomeTx;

  const buckets = emptyPairs();
  if (hasTicketSales) {
    buckets.bilheteira = { net: ticket.net, gross: ticket.gross };
  }
  for (const t of incomeTx) {
    const code = t.account_categories?.code ?? "";
    const cls = classifyIncomeL1(code);
    const net = Number(t.amount || 0);
    const gross = calcTotalWithIva(net, Number(t.iva_rate || 0));
    buckets[cls] = { net: buckets[cls].net + net, gross: buckets[cls].gross + gross };
  }
  const realTotal = REVENUE_BUCKETS.reduce<MoneyPair>(
    (acc, b) => ({ net: acc.net + buckets[b].net, gross: acc.gross + buckets[b].gross }),
    zeroPair(),
  );

  const real: RevenueRealBasis = {
    total: realTotal,
    buckets,
    ticket,
    hasTicketSales,
    incomeTx,
    excludedTicketingTx,
  };

  // ── PREVISTO CORRENTE ────────────────────────────────────────────
  const sponsorship = await computeSponsorshipSynthetic(eventId, ids);
  const ticketForecast = skipForecast ? null : await computeLiveTicketForecast(eventId);

  // Outras receitas: linhas de BP income da versão activa que NÃO são
  // representadas por linhas sintéticas (bilheteira / A&B / patrocínios).
  const { data: fcs } = await supabase
    .from("event_forecasts")
    .select("id, event_id, amount, iva_rate, category_id, status, is_transitory, exclude_from_result, is_overhead, event_settlement_id, account_categories(code)")
    .in("event_id", ids)
    .is("version_id", null)
    .eq("type", "income");

  const excludedIds = new Set(sponsorship.excludedForecastIds);
  let othersForecast: number | null = null;
  for (const f of keepRootPerimeter((fcs ?? []) as any[], roots.rootIds)) {
    if (f.status !== "approved") continue;
    if (f.is_transitory || f.exclude_from_result || f.is_overhead) continue;
    if (excludedIds.has(f.id)) continue;
    const cls = classifyIncomeL1(f.account_categories?.code);
    if (cls === "bilheteira" || cls === "ab") continue;
    if (cls === "patrocinio" && sponsorship.hasTargets) continue;
    if (cls === "patrocinio") continue; // representado pelo bucket patrocínio
    othersForecast = (othersForecast ?? 0) + Number(f.amount || 0);
  }

  const sponsorForecast = sponsorship.hasTargets
    ? sponsorship.currentNet
    : sponsorship.realNet > 0
      ? sponsorship.realNet
      : null;

  const forecastBuckets: Record<RevenueBucket, number | null> = {
    bilheteira: ticketForecast?.net ?? null,
    ab: abForecastNet ?? null,
    patrocinio: sponsorForecast,
    outros: othersForecast,
  };
  const anyForecast = REVENUE_BUCKETS.some((b) => forecastBuckets[b] != null);
  const currentForecast: RevenueForecastBasis = {
    total: anyForecast
      ? REVENUE_BUCKETS.reduce((s, b) => s + (forecastBuckets[b] ?? 0), 0)
      : null,
    buckets: forecastBuckets,
  };

  // ── PREVISTO + EXCEDIDO (D24) ────────────────────────────────────
  const committedBuckets = {} as Record<RevenueBucket, number>;
  for (const b of REVENUE_BUCKETS) {
    const r = buckets[b].net;
    const f = forecastBuckets[b];
    committedBuckets[b] = Math.max(r, f ?? r);
  }
  const committed = {
    total: REVENUE_BUCKETS.reduce((s, b) => s + committedBuckets[b], 0),
    buckets: committedBuckets,
  };

  return { real, currentForecast, committed, sponsorship, ticketForecast };
}
