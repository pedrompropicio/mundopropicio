/**
 * Receitas / Despesas / Lucro da GRELHA de eventos (/eventos) — issues #221/#223.
 *
 * REGRA (ditada pelo dono do negócio): o card de cada evento na grelha mostra
 * EXACTAMENTE os mesmos números que os cards dentro desse evento, no âmbito da
 * Visão Global (turnê inteira). Receita e despesa nas vistas guardadas por
 * utilizador+evento+card (perímetro e IVA); por omissão s/IVA. Lucro = receita
 * exibida − despesa exibida (subtração cega, igual ao card de Lucro).
 *
 * NÃO há segunda implementação: a receita passa pelo núcleo puro do SSoT
 * (`computeRevenueBasisFromRows` + `computeSponsorshipSyntheticFromRows`), a
 * despesa por `computeEventCostOnBasis` (D57/#217) e o cachê efectivo por
 * `fetchEventsListCacheImpact`, que corre a mesma regra do card de Custos.
 *
 * DIFERENÇA DELIBERADA face à capa: aqui não se corre o simulador de bilheteira
 * (`computeLiveTicketForecast`) nem os cenários do módulo A&B — são dezenas de
 * leituras por evento. É o mesmo que `computeEventRevenueBasis({ skipForecast: true })`.
 *
 * LEITURAS: número FIXO de consultas para toda a lista (nunca N por evento) e
 * todas paginadas — o PostgREST corta aos 1.000 registos em silêncio (#206).
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import { computeEventCostOnBasis, type EventCostMode } from "@/lib/event-cost-basis";
import { isValidFechoTransaction } from "@/lib/fecho-filters";
import { keepRootPerimeter } from "@/lib/settlement-perimeter";
import { fetchRootSettlements } from "@/hooks/useEventRootSettlements";
import {
  computeRevenueBasisFromRows,
  fetchTicketSalesTotals,
  type MoneyPair,
} from "@/lib/event-revenue-basis";
import { computeSponsorshipSyntheticFromRows } from "@/lib/bp-sponsorship-synthetic";
import { fetchEventsListCacheImpact } from "@/lib/events-list-cache-impact";

export interface EventsListFinancialSpec {
  /** Evento raiz (linha da grelha). */
  id: string;
  /** Raiz + sub-eventos agregados nessa linha (inclui sempre `id`). */
  ids: string[];
  /** Modo do card de Custos (vista guardada). */
  costMode: EventCostMode;
  /** Modo do card de Receitas (vista guardada). */
  incomeMode?: "realized" | "committed" | "forecast";
  includeOverhead: boolean;
  /** `events.sponsorship_closed_at` da raiz. */
  sponsorshipClosedAt: string | null;
  /** Vista de IVA do card de Receitas (default s/IVA). */
  incomeWithVat?: boolean;
  /** Vista de IVA do card de Custos (default s/IVA). */
  expenseWithVat?: boolean;
  /** `events.status` — o cachê efectivo só conta em active/completed. */
  status?: string | null;
}

export interface EventsListFinancialTotals {
  income: number;
  expense: number;
  profit: number;
  /** Bilhetes vendidos (mesma fonte do card de Bilhetes). */
  ticketsSold: number;
  /** Houve alguma base prevista (BP/bilheteira/patrocínios)? */
  hasBasis: boolean;
}

export type EventsListFinancials = Record<string, EventsListFinancialTotals>;

const num = (v: any) => Number(v || 0);
const pick = (p: MoneyPair | null | undefined, withVat: boolean) =>
  p ? (withVat ? p.gross : p.net) : 0;

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
        "id, event_id, type, status, amount, iva_rate, category_id, is_transitory, exclude_from_result, reversed_at, is_hidden, parent_transaction_id, split_percentage, event_settlement_id, account_categories(code, name)",
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
      .select("id, event_id, segment_id, amount, baseline_amount, sponsorship_segments(name, sort_order)")
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
  const txsAll = (txRes.data ?? []) as any[];
  const txs = keepRootPerimeter(txsAll, roots.rootIds);
  const fcs = keepRootPerimeter((fcRes.data ?? []) as any[], roots.rootIds);

  // Cachê efectivo — mesma regra do card de Custos, em lote.
  const cacheImpact = await fetchEventsListCacheImpact(
    specs.map((s) => ({
      id: s.id,
      childIds: s.ids.filter((x) => x && x !== s.id),
      status: s.status,
    })),
    txsAll,
  );

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
    const incomeWithVat = spec.incomeWithVat === true;
    const expenseWithVat = spec.expenseWithVat === true;

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
        withVat: expenseWithVat,
        includeOverhead: spec.includeOverhead,
      });
      expense += r.total;
      if (r.approvedCount > 0) expenseHasBp = true;
    }
    // Cachê ainda não lançado em transações (igual ao card de Custos).
    expense += num(cacheImpact[spec.id]);

    // ── RECEITA: núcleo puro do SSoT (D24) ───────────────────────────
    const ticket = ids.reduce<MoneyPair>(
      (acc, id) => {
        const t = ticketByEvent.get(id);
        return { net: acc.net + num(t?.net), gross: acc.gross + num(t?.gross) };
      },
      { net: 0, gross: 0 },
    );
    const ticketsSold = ids.reduce((s, id) => s + num(ticketByEvent.get(id)?.quantity), 0);

    const incomeTx = ids
      .flatMap((id) => txByEvent.get(id) ?? [])
      .filter((t: any) => t.type === "income" && isValidFechoTransaction(t));
    const incomeForecasts = ids
      .flatMap((id) => fcByEvent.get(id) ?? [])
      .filter((f: any) => f.type === "income");

    const sponsorship = computeSponsorshipSyntheticFromRows({
      targets: ids.flatMap((id) => targetsByEvent.get(id) ?? []),
      cards: ids.flatMap((id) => cardsByEvent.get(id) ?? []),
      closedAt: spec.sponsorshipClosedAt,
      incomeForecasts,
    });

    const revenue = computeRevenueBasisFromRows({
      ticket,
      incomeTx,
      incomeForecasts,
      sponsorship,
      ticketForecast: null,
      abForecastNet: null,
    });

    const incomeMode = spec.incomeMode ?? "committed";
    const income =
      incomeMode === "realized"
        ? pick(revenue.real.total, incomeWithVat)
        : incomeMode === "forecast"
          ? pick(revenue.currentForecast.total ?? revenue.committed.total, incomeWithVat)
          : pick(revenue.committed.total, incomeWithVat);

    const hasBasis =
      expenseHasBp ||
      revenue.real.hasTicketSales ||
      revenue.currentForecast.total != null ||
      income !== 0 ||
      expense !== 0;

    out[spec.id] = { income, expense, profit: income - expense, ticketsSold, hasBasis };
  }

  return out;
}
