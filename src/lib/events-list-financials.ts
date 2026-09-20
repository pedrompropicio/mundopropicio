/**
 * Receitas / Despesas / Lucro da GRELHA de eventos (/eventos) — issue #221.
 *
 * A grelha lia só `transactions` approved/paid, com aritmética local: dava
 * 0,00 € de receita em todos os eventos e ignorava por completo o BP.
 * Passa a usar EXACTAMENTE a mesma base dos cards da capa do evento:
 *   - Despesa: `computeEventCostOnBasis` (D57 / #217), um evento de cada vez,
 *     no critério gravado em `events.cost_expense_source` e com o overhead
 *     conforme `events.cost_include_overhead`.
 *   - Receita: mesma definição de `event-revenue-basis.ts` (D24) —
 *     "previsto + excedido" por componente, max(real, previsto ?? real), com
 *     a correcção #220 (sem sintética, as linhas de BP alimentam o bucket).
 *   - Lucro = Receita − Despesa na mesma base.
 *
 * DIFERENÇA DELIBERADA face à capa: aqui não se corre o simulador de bilheteira
 * (`computeLiveTicketForecast`) nem os cenários do módulo A&B — são dezenas de
 * leituras por evento. É o mesmo que `computeEventRevenueBasis({ skipForecast: true })`:
 * sem sintética de bilheteira/A&B, o previsto desses componentes vem do BP.
 *
 * LEITURAS: número FIXO de consultas para toda a lista (nunca N por evento) e
 * todas paginadas — o PostgREST corta aos 1.000 registos em silêncio (#206).
 *
 * Este ficheiro é CONSUMIDOR: não altera `event-revenue-basis.ts`,
 * `event-cost-basis.ts` nem `useEventFinancialCardData.ts`.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import { computeEventCostOnBasis, type EventCostMode } from "@/lib/event-cost-basis";
import { isValidFechoTransaction, isBilheteiraCategoryCode } from "@/lib/fecho-filters";
import { keepRootPerimeter } from "@/lib/settlement-perimeter";
import { fetchRootSettlements } from "@/hooks/useEventRootSettlements";
import { fetchTicketSalesTotals, REVENUE_BUCKETS, type RevenueBucket } from "@/lib/event-revenue-basis";
import { classifyIncomeL1 } from "@/lib/event-financial-card";

export interface EventsListFinancialSpec {
  /** Evento raiz (linha da grelha). */
  id: string;
  /** Raiz + sub-eventos agregados nessa linha (inclui sempre `id`). */
  ids: string[];
  costMode: EventCostMode;
  includeOverhead: boolean;
  /** `events.sponsorship_closed_at` da raiz. */
  sponsorshipClosedAt: string | null;
}

export interface EventsListFinancialTotals {
  income: number;
  expense: number;
  profit: number;
  /** Houve alguma base prevista (BP/bilheteira/patrocínios)? */
  hasBasis: boolean;
}

export type EventsListFinancials = Record<string, EventsListFinancialTotals>;

const num = (v: any) => Number(v || 0);

export async function fetchEventsListFinancials(
  specs: EventsListFinancialSpec[],
): Promise<EventsListFinancials> {
  const out: EventsListFinancials = {};
  const allIds = Array.from(new Set(specs.flatMap((s) => s.ids).filter(Boolean)));
  if (allIds.length === 0) return out;

  const [txRes, fcRes, roots, ticketRows, targetsRes, cardsRes] = await Promise.all([
    fetchAllPagedQuery(supabase
      .from("transactions")
      .select(
        "id, event_id, type, status, amount, iva_rate, category_id, is_transitory, exclude_from_result, reversed_at, is_hidden, event_settlement_id, account_categories(code)",
      )
      .in("event_id", allIds)),
    fetchAllPagedQuery(supabase
      .from("event_forecasts")
      .select(
        "id, event_id, type, amount, iva_rate, category_id, status, is_transitory, exclude_from_result, is_overhead, event_settlement_id, account_categories(code)",
      )
      .in("event_id", allIds)
      .is("version_id", null)),
    fetchRootSettlements(allIds),
    fetchTicketSalesTotals(allIds),
    fetchAllPagedQuery(supabase
      .from("event_sponsorship_targets" as never)
      .select("id, event_id, segment_id, amount")
      .in("event_id", allIds)),
    fetchAllPagedQuery(supabase
      .from("sponsorship_pipeline" as never)
      .select("id, event_id, stage, is_barter, confirmed_amount, segment_id, linked_forecast_id")
      .in("event_id", allIds)),
  ]);

  if (txRes.error) throw txRes.error;
  if (fcRes.error) throw fcRes.error;

  // Perímetro da raiz (D25 g3): linhas de um fechamento filho não entram no
  // resultado do evento.
  const txs = keepRootPerimeter((txRes.data ?? []) as any[], roots.rootIds);
  const fcs = keepRootPerimeter((fcRes.data ?? []) as any[], roots.rootIds);

  const byEvent = <T extends { event_id?: string | null }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const k = r.event_id as string;
      if (!k) continue;
      const arr = m.get(k);
      if (arr) arr.push(r);
      else m.set(k, [r]);
    }
    return m;
  };

  const txByEvent = byEvent(txs);
  const fcByEvent = byEvent(fcs);
  const ticketByEvent = new Map(ticketRows.map((r) => [r.eventId, r]));
  const targetsByEvent = byEvent(((targetsRes.data ?? []) as any[]));
  const cardsByEvent = byEvent(((cardsRes.data ?? []) as any[]));

  for (const spec of specs) {
    const ids = Array.from(new Set(spec.ids.filter(Boolean)));

    // ── DESPESA: um evento de cada vez, nunca um pool (#217) ──────────
    let expense = 0;
    let expenseHasBp = false;
    for (const id of ids) {
      const evFc = (fcByEvent.get(id) ?? []).filter((f: any) => f.type === "expense");
      const evTx = (txByEvent.get(id) ?? []).filter((t: any) => t.type === "expense");
      const r = computeEventCostOnBasis({
        forecasts: evFc,
        transactions: evTx,
        mode: spec.costMode,
        withVat: false,
        includeOverhead: spec.includeOverhead,
      });
      expense += r.total;
      if (r.approvedCount > 0) expenseHasBp = true;
    }

    // ── RECEITA REAL ─────────────────────────────────────────────────
    const ticket = ids.reduce(
      (acc, id) => {
        const t = ticketByEvent.get(id);
        return { net: acc.net + num(t?.net), gross: acc.gross + num(t?.gross) };
      },
      { net: 0, gross: 0 },
    );
    const hasTicketSales = ticket.net !== 0 || ticket.gross !== 0;

    const incomeTxAll = ids
      .flatMap((id) => txByEvent.get(id) ?? [])
      .filter((t: any) => t.type === "income" && isValidFechoTransaction(t));
    // Anti-duplicação: com `ticket_sales`, as TX de 1.1.01 são o MESMO dinheiro.
    const incomeTx = hasTicketSales
      ? incomeTxAll.filter((t: any) => !isBilheteiraCategoryCode(t.account_categories?.code))
      : incomeTxAll;

    const real: Record<RevenueBucket, number> = { bilheteira: 0, ab: 0, patrocinio: 0, outros: 0 };
    if (hasTicketSales) real.bilheteira = ticket.net;
    for (const t of incomeTx) {
      real[classifyIncomeL1((t as any).account_categories?.code)] += num((t as any).amount);
    }

    // ── PATROCÍNIOS: sintética (líquido) agregada para os ids da linha ─
    const targets = ids.flatMap((id) => targetsByEvent.get(id) ?? []);
    const closedCards = ids
      .flatMap((id) => cardsByEvent.get(id) ?? [])
      .filter((c: any) => c.stage === "closed" && !c.is_barter);
    const sponsorRealNet = closedCards.reduce((s, c: any) => s + num(c.confirmed_amount), 0);
    const closedBySegment = new Map<string, number>();
    for (const c of closedCards as any[]) {
      const k = (c.segment_id as string | null) ?? "__none__";
      closedBySegment.set(k, (closedBySegment.get(k) ?? 0) + num(c.confirmed_amount));
    }
    const targetBySegment = new Map<string, number>();
    for (const t of targets as any[]) {
      const k = t.segment_id as string;
      targetBySegment.set(k, (targetBySegment.get(k) ?? 0) + num(t.amount));
    }
    const sponsorshipClosed = !!spec.sponsorshipClosedAt;
    let remaining = 0;
    for (const [seg, target] of targetBySegment) {
      remaining += sponsorshipClosed ? 0 : Math.max(0, target - (closedBySegment.get(seg) ?? 0));
    }
    const hasTargets = targetBySegment.size > 0;
    const sponsorForecast: number | null = hasTargets
      ? sponsorRealNet + remaining
      : sponsorRealNet > 0
        ? sponsorRealNet
        : null;
    const excludedForecastIds = new Set(
      closedCards.map((c: any) => c.linked_forecast_id as string | null).filter(Boolean) as string[],
    );

    // ── PREVISTO CORRENTE a partir do BP (#220) ──────────────────────
    let bpBilheteira: number | null = null;
    let bpAb: number | null = null;
    let bpOutros: number | null = null;
    for (const id of ids) {
      for (const f of (fcByEvent.get(id) ?? []) as any[]) {
        if (f.type !== "income") continue;
        if (f.status !== "approved") continue;
        if (f.is_transitory || f.exclude_from_result || f.is_overhead) continue;
        if (excludedForecastIds.has(f.id)) continue;
        const cls = classifyIncomeL1(f.account_categories?.code);
        if (cls === "patrocinio") continue; // representado pelo bucket patrocínio
        if (cls === "bilheteira" && hasTicketSales) continue; // sintética substitui
        const net = num(f.amount);
        if (cls === "bilheteira") bpBilheteira = (bpBilheteira ?? 0) + net;
        else if (cls === "ab") bpAb = (bpAb ?? 0) + net;
        else bpOutros = (bpOutros ?? 0) + net;
      }
    }

    const forecast: Record<RevenueBucket, number | null> = {
      bilheteira: bpBilheteira,
      ab: bpAb,
      patrocinio: sponsorForecast,
      outros: bpOutros,
    };

    // ── PREVISTO + EXCEDIDO (D24): max(real, previsto ?? real) ───────
    let income = 0;
    for (const b of REVENUE_BUCKETS) income += Math.max(real[b], forecast[b] ?? real[b]);

    const hasBasis =
      expenseHasBp ||
      hasTicketSales ||
      REVENUE_BUCKETS.some((b) => forecast[b] != null) ||
      income !== 0 ||
      expense !== 0;

    out[spec.id] = { income, expense, profit: income - expense, hasBasis };
  }

  return out;
}
