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
 *                         verbas, fechados sem verbas); para os TRÊS buckets com
 *                         módulo (bilheteira / A&B / patrocínios) a sintética
 *                         SUBSTITUI a linha de BP, nunca soma — sem sintética, as
 *                         linhas de BP aprovadas alimentam o bucket (#220, #225);
 *                         outras receitas = linhas de BP `type='income'` da
 *                         versão activa não representadas por sintéticas.
 *                         `null` por componente quando não há base.
   *                         #227: DEPOIS da data do evento (ou `completed`), as
   *                         sintéticas de bilheteira e A&B são o REAL — o
   *                         simulador e o cenário A&B só valem até à data do
   *                         evento. Patrocínios não mudam (D22).
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
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import { isEventRealized } from "@/lib/event-realized";

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
  total: MoneyPair | null;
  buckets: Record<RevenueBucket, MoneyPair | null>;
}

export interface EventRevenueBasis {
  real: RevenueRealBasis;
  currentForecast: RevenueForecastBasis;
  /**
   * Previsto + excedido (D24): por componente e por base de IVA,
   * max(real, previsto corrente ?? real). O IVA é vista, não critério (#207).
   */
  committed: { total: MoneyPair; buckets: Record<RevenueBucket, MoneyPair> };
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
  /** #208 — Taxa de IVA (%) do previsto de A&B; resolvida do evento se omitida. */
  abForecastIvaRate?: number | null;
  /** Saltar o cálculo do previsto corrente (mais barato). Default false. */
  skipForecast?: boolean;
  /**
   * Evento já realizado (#227). Quando `undefined`, é calculado aqui a partir de
   * `events.status` e das datas (própria + sub-eventos), via `isEventRealized`.
   */
  eventRealized?: boolean;
}

/** Lê `events` e decide se o evento (ou a turnê) já aconteceu — #227. */
export async function fetchEventRealized(eventId: string, eventIds: string[] = []): Promise<boolean> {
  const ids = Array.from(new Set([eventId, ...eventIds])).filter(Boolean);
  const [{ data: rows }, { data: children }] = await Promise.all([
    supabase.from("events").select("id, status, date").in("id", ids),
    supabase.from("events").select("id, date").in("parent_event_id", ids),
  ]);
  const self = (rows ?? []).find((r: any) => r.id === eventId) as any;
  const childDates = [
    ...((rows ?? []) as any[]).filter((r) => r.id !== eventId).map((r) => r.date),
    ...((children ?? []) as any[]).map((r) => r.date),
  ];
  return isEventRealized({ status: self?.status ?? null, date: self?.date ?? null, childDates });
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

/**
 * NÚCLEO PURO da receita (sem queries) — partilhado com a grelha de eventos.
 *
 * Recebe as linhas JÁ filtradas (status canónico do Fecho + perímetro da raiz)
 * e devolve as três bases. É aqui que vive a regra; `computeEventRevenueBasis`
 * é só o fetcher de um evento e a grelha lê em lote e chama esta função.
 */
export interface RevenueBasisRows {
  ticket: MoneyPair;
  /** `type='income'`, approved/paid, perímetro da raiz, com `account_categories(code)`. */
  incomeTx: any[];
  /** BP income da versão activa, perímetro da raiz, com `account_categories(code)`. */
  incomeForecasts: any[];
  sponsorship: SponsorshipSyntheticResult;
  ticketForecast?: LiveTicketForecast | null;
  abForecastNet?: number | null;
  /**
   * #208 — Taxa de IVA (%) a aplicar ao previsto de A&B. Opcional: quando não
   * é dada, é resolvida das linhas de A&B do próprio evento.
   */
  abForecastIvaRate?: number | null;
  /**
   * Evento já realizado (#227): as sintéticas de bilheteira e A&B passam a ser o
   * REAL — o previsto do simulador e do cenário A&B só vale até à data do evento.
   * Patrocínios não mudam (D22 já tem `sponsorship_closed_at`).
   */
  eventRealized?: boolean;
}

/** Taxa de IVA ponderada pelo valor líquido. `null` se não houver base. */
function weightedIvaRate(rows: Array<{ amount?: any; iva_rate?: any }>): number | null {
  let base = 0;
  let iva = 0;
  for (const r of rows) {
    const net = Number(r.amount || 0);
    if (!net) continue;
    base += net;
    iva += (net * Number(r.iva_rate || 0)) / 100;
  }
  if (base === 0) return null;
  return (iva / base) * 100;
}

/**
 * #208 — Taxa de IVA do bucket A&B. Ordem: taxa injectada → linhas de BP de
 * A&B (1.1.03) → TX reais de A&B → 0 (bruto = líquido, como antes).
 */
export function resolveAbIvaRate(rows: RevenueBasisRows): number {
  if (rows.abForecastIvaRate != null) return Number(rows.abForecastIvaRate);
  const bpAb = (rows.incomeForecasts ?? []).filter(
    (f: any) =>
      classifyIncomeL1(f.account_categories?.code) === "ab" &&
      f.status === "approved" &&
      !f.is_transitory && !f.exclude_from_result && !f.is_overhead,
  );
  const fromBp = weightedIvaRate(bpAb);
  if (fromBp != null) return fromBp;
  const txAb = (rows.incomeTx ?? []).filter(
    (t: any) => classifyIncomeL1(t.account_categories?.code) === "ab",
  );
  return weightedIvaRate(txAb) ?? 0;
}

export async function computeEventRevenueBasis(
  args: EventRevenueBasisArgs,
): Promise<EventRevenueBasis> {
  const { eventId, abForecastNet = null, skipForecast = false } = args;
  const ids = Array.from(new Set([eventId, ...(args.eventIds ?? [])])).filter(Boolean);

  // ── REAL ─────────────────────────────────────────────────────────
  const [ticket, txRes, roots] = await Promise.all([
    fetchTicketSalesRevenue(ids),
    fetchAllPagedQuery(supabase
      .from("transactions")
      .select(
        "id, event_id, type, status, amount, iva_rate, category_id, is_transitory, exclude_from_result, reversed_at, is_hidden, description, event_settlement_id, account_categories(code, name)",
      )
      .in("event_id", ids)
      .eq("type", "income")
      .in("status", ["approved", "paid"])),
    fetchRootSettlements(ids),
  ]);

  // Perímetro da raiz (D25 g3): linhas marcadas com um fechamento filho são
  // exclusivas desse fechamento e não entram no resultado do evento.
  const allIncomeTxRows = keepRootPerimeter(
    ((txRes.data ?? []) as any[]).filter((t) => isValidFechoTransaction(t)),
    roots.rootIds,
  );

  const sponsorship = await computeSponsorshipSynthetic(eventId, ids);
  // #227: evento já realizado → as sintéticas de bilheteira/A&B são o real e o
  // simulador nem corre (poupa leituras).
  const eventRealized =
    args.eventRealized ?? (await fetchEventRealized(eventId, ids));
  const ticketForecast =
    skipForecast || eventRealized ? null : await computeLiveTicketForecast(eventId);

  const { data: fcs } = await fetchAllPagedQuery(supabase
    .from("event_forecasts")
    .select("id, event_id, amount, iva_rate, category_id, status, is_transitory, exclude_from_result, is_overhead, event_settlement_id, account_categories(code)")
    .in("event_id", ids)
    .is("version_id", null)
    .eq("type", "income"));

  return computeRevenueBasisFromRows({
    ticket,
    incomeTx: allIncomeTxRows,
    incomeForecasts: keepRootPerimeter((fcs ?? []) as any[], roots.rootIds),
    sponsorship,
    ticketForecast,
    abForecastNet,
    abForecastIvaRate: args.abForecastIvaRate ?? null,
    eventRealized,
  });
}

export function computeRevenueBasisFromRows(rows: RevenueBasisRows): EventRevenueBasis {
  const { ticket, sponsorship, eventRealized = false } = rows;
  // #227: depois do evento, a sintética de bilheteira e a de A&B são o real.
  // Anular as previsões AQUI mantém tudo o resto intacto: com `ticket_sales`
  // `hasTicketSynthetic` continua verdadeiro (committed = max(real, real)) e sem
  // `ticket_sales` as linhas de BP alimentam o bucket como hoje (#220/#225).
  const ticketForecast = eventRealized ? null : (rows.ticketForecast ?? null);
  const abForecastNet = eventRealized ? null : (rows.abForecastNet ?? null);
  const allIncomeTx = rows.incomeTx;
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
  // Linhas de BP income da versão activa. As classes com módulo próprio
  // (bilheteira / A&B / patrocínios) só são descartadas se EXISTIR sintética
  // para esse componente — a sintética SUBSTITUI a linha de BP, nunca soma
  // (#220, #225). Sem sintética, as linhas de BP alimentam o bucket.
  const ticketForecastPair: MoneyPair | null =
    ticketForecast?.net != null
      ? { net: ticketForecast.net, gross: ticketForecast.gross ?? ticketForecast.net }
      : null;

  // #208 — A&B: `abForecastNet` vem LÍQUIDO do módulo A&B. O módulo A&B não
  // guarda taxa de IVA (não há coluna em `event_ab_config`/`event_ab_zones`),
  // por isso a taxa é a do PRÓPRIO evento, resolvida por
  // `resolveAbIvaRate`: (1) taxa injectada, (2) taxa ponderada das linhas de BP
  // de A&B (1.1.03), (3) taxa ponderada das TX reais de A&B. Sem nenhuma fonte
  // → bruto = líquido (comportamento anterior, zero regressão).
  const abIvaRate = resolveAbIvaRate(rows);
  const abForecastPair: MoneyPair | null =
    abForecastNet != null
      ? { net: abForecastNet, gross: calcTotalWithIva(abForecastNet, abIvaRate) }
      : null;

  // Há sintética para o componente? Se não, o BP alimenta-o — vale para os
  // TRÊS buckets com módulo (#220 bilheteira/A&B, #225 patrocínios).
  const hasTicketSynthetic = ticketForecastPair != null || hasTicketSales;
  const hasAbSynthetic = abForecastPair != null;

  // Patrocínios: a sintética só existe com verbas (ou fechados reais). Sem ela,
  // as linhas de BP 1.2.x aprovadas alimentam o bucket (#225) — antes eram
  // descartadas SEMPRE e a receita prevista ficava a zero (Newgang: −31.000).
  const sponsorForecast: MoneyPair | null = sponsorship.hasTargets
    ? { net: sponsorship.currentNet ?? 0, gross: sponsorship.currentGross ?? sponsorship.currentNet ?? 0 }
    : sponsorship.realNet > 0
      ? { net: sponsorship.realNet, gross: sponsorship.realGross || sponsorship.realNet }
      : null;

  const excludedIds = new Set(sponsorship.excludedForecastIds);
  // Bruto pelo `iva_rate` da própria linha (Art.º 18 CIVA, linha a linha).
  let othersForecast: MoneyPair | null = null;
  let bpBilheteira: MoneyPair | null = null;
  let bpAb: MoneyPair | null = null;
  let bpPatrocinio: MoneyPair | null = null;
  const addTo = (acc: MoneyPair | null, net: number, gross: number): MoneyPair => ({
    net: (acc?.net ?? 0) + net,
    gross: (acc?.gross ?? 0) + gross,
  });
  for (const f of rows.incomeForecasts) {
    if (f.status !== "approved") continue;
    if (f.is_transitory || f.exclude_from_result || f.is_overhead) continue;
    if (excludedIds.has(f.id)) continue;
    const cls = classifyIncomeL1(f.account_categories?.code);
    if (cls === "bilheteira" && hasTicketSynthetic) continue;
    if (cls === "ab" && hasAbSynthetic) continue;
    if (cls === "patrocinio" && sponsorForecast != null) continue; // sintética substitui (#225)
    const net = Number(f.amount || 0);
    const gross = calcTotalWithIva(net, Number(f.iva_rate || 0));
    if (cls === "bilheteira") bpBilheteira = addTo(bpBilheteira, net, gross);
    else if (cls === "ab") bpAb = addTo(bpAb, net, gross);
    else if (cls === "patrocinio") bpPatrocinio = addTo(bpPatrocinio, net, gross);
    else othersForecast = addTo(othersForecast, net, gross);
  }

  const forecastBuckets: Record<RevenueBucket, MoneyPair | null> = {
    bilheteira: ticketForecastPair ?? bpBilheteira,
    ab: abForecastPair ?? bpAb,
    patrocinio: sponsorForecast ?? bpPatrocinio,
    outros: othersForecast,
  };
  const anyForecast = REVENUE_BUCKETS.some((b) => forecastBuckets[b] != null);
  const currentForecast: RevenueForecastBasis = {
    total: anyForecast
      ? REVENUE_BUCKETS.reduce<MoneyPair>(
          (acc, b) => ({
            net: acc.net + (forecastBuckets[b]?.net ?? 0),
            gross: acc.gross + (forecastBuckets[b]?.gross ?? 0),
          }),
          zeroPair(),
        )
      : null,
    buckets: forecastBuckets,
  };

  // ── PREVISTO + EXCEDIDO (D24) ────────────────────────────────────
  // Em CADA base de IVA, bucket a bucket: max(real, previsto ?? real) (#207).
  const committedBuckets = {} as Record<RevenueBucket, MoneyPair>;
  for (const b of REVENUE_BUCKETS) {
    const r = buckets[b];
    const f = forecastBuckets[b];
    committedBuckets[b] = {
      net: Math.max(r.net, f?.net ?? r.net),
      gross: Math.max(r.gross, f?.gross ?? r.gross),
    };
  }
  const committed = {
    total: REVENUE_BUCKETS.reduce<MoneyPair>(
      (acc, b) => ({ net: acc.net + committedBuckets[b].net, gross: acc.gross + committedBuckets[b].gross }),
      zeroPair(),
    ),
    buckets: committedBuckets,
  };

  return { real, currentForecast, committed, sponsorship, ticketForecast };
}
