/**
 * #339 B — Receita do MASTER repartida pelas cidades (proração VIRTUAL).
 *
 * Irmã de `overhead-proration.ts` e `master-adopted-expense-proration.ts`.
 * A regra vive na LINHA DE BP de receita do Master
 * (`event_forecasts.revenue_split_mode` / `revenue_split_params`):
 *
 *   • equal         — ÷N; resto do arredondamento na última cidade.
 *   • fixed_pct     — params `{ "<event_id>": pct }`, só cidades do Master,
 *                     soma 100 (±0,01). Inválido → não reparte + aviso.
 *   • ticket_share  — peso = bilheteira de cada cidade, MESMA base para todas:
 *                     previsto corrente enquanto alguma cidade não estiver
 *                     realizada; real de todas quando a última se realizar.
 *                     Base total zero → não reparte + aviso.
 *
 * Em todos os modos a soma das fatias é IGUAL à linha ao cêntimo (o resto vai
 * para a última cidade, por data e id).
 *
 * Transações `income` do Master ligadas à linha (`forecast_id`) seguem a mesma
 * regra. Transação sem linha (ou linha sem regra) fica só no Master.
 * Linhas `is_overhead` / `exclude_from_result` / `is_transitory` não se repartem.
 * A fatia mantém `event_settlement_id` e as restantes marcações da origem.
 *
 * Só RESULTADO: caixa, saldos, conciliação e receitas em poder do sócio ficam
 * sempre no Master (as fatias não têm `account_id`).
 *
 * Regra de perímetro (`masterRevenueView`):
 *   • raiz (Master + cidades) → linhas originais; nunca as fatias.
 *   • vista de uma cidade     → só a fatia; nunca a linha do Master.
 */

export type RevenueSplitMode = "equal" | "fixed_pct" | "ticket_share";

export const REVENUE_SPLIT_MODES: RevenueSplitMode[] = ["equal", "fixed_pct", "ticket_share"];

export const REVENUE_SPLIT_MODE_LABEL: Record<RevenueSplitMode, string> = {
  equal: "Partes iguais",
  fixed_pct: "% fixa por cidade",
  ticket_share: "Proporcional à bilheteira",
};

export interface MasterRevenueEventLike {
  id: string;
  parent_event_id?: string | null;
  date?: string | null;
  [key: string]: any;
}

export interface MasterRevenueForecastLike {
  id: string;
  event_id: string;
  type?: string | null;
  amount: number | string;
  revenue_split_mode?: string | null;
  revenue_split_params?: any;
  is_overhead?: boolean | null;
  exclude_from_result?: boolean | null;
  is_transitory?: boolean | null;
  excluded_from_partner_settlement?: boolean;
  [key: string]: any;
}

export interface MasterRevenueTransactionLike {
  id: string;
  event_id: string;
  type?: string | null;
  amount: number | string;
  forecast_id?: string | null;
  [key: string]: any;
}

export interface TicketShareBasis {
  /** Bilheteira prevista corrente por cidade (s/IVA). */
  forecastByEvent?: Record<string, number>;
  /** Bilheteira real por cidade (s/IVA). */
  realByEvent?: Record<string, number>;
  /** Cidades já realizadas (todas → usa o real). */
  realizedEventIds?: string[];
}

export interface MasterRevenueWarning {
  forecastId: string;
  masterEventId: string;
  code: "fixed_pct_invalido" | "ticket_share_base_zero" | "modo_desconhecido";
  message: string;
}

export type MasterRevenueSlice<T> = T & {
  _revenue_via_master: true;
  _master_event_id: string;
  _master_forecast_id: string;
  _master_transaction_id?: string;
  _split_share: number;
  _revenue_split_mode: RevenueSplitMode;
};

export interface MasterRevenueSplitResult<F, T> {
  forecastSlices: MasterRevenueSlice<F>[];
  transactionSlices: MasterRevenueSlice<T>[];
  /** Quota (0..1) por linha do Master e por cidade. */
  shares: Record<string, Record<string, number>>;
  /** Linhas do Master efectivamente repartidas. */
  sourceForecastIds: Set<string>;
  /** Transações do Master efectivamente repartidas. */
  sourceTransactionIds: Set<string>;
  /** Base usada no ticket_share por linha ("forecast" | "real"). */
  ticketBasisUsed: Record<string, "forecast" | "real">;
  warnings: MasterRevenueWarning[];
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function isRevenueSplitMode(v: unknown): v is RevenueSplitMode {
  return typeof v === "string" && (REVENUE_SPLIT_MODES as string[]).includes(v);
}

/** Uma linha é elegível para repartir? (não olha a existência de cidades) */
export function isSplittableMasterRevenueLine(f: MasterRevenueForecastLike): boolean {
  return (
    (f.type == null || f.type === "income") &&
    isRevenueSplitMode(f.revenue_split_mode) &&
    !f.is_overhead &&
    !f.exclude_from_result &&
    !f.is_transitory
  );
}

/** Reparte `amount` pelos pesos, ao cêntimo; o resto vai para a última. */
export function allocateCents(amount: number, weights: number[]): number[] {
  const total = round2(amount);
  if (weights.length === 0) return [];
  const sumW = weights.reduce((s, w) => s + w, 0);
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    const v = round2(sumW > 0 ? (total * weights[i]) / sumW : 0);
    out.push(v);
    acc = round2(acc + v);
  }
  out.push(round2(total - acc));
  return out;
}

/** Valida params de fixed_pct: só cidades do Master e soma 100 (±0,01). */
export function validateFixedPct(
  params: any,
  cityIds: string[],
): { ok: true; weights: number[] } | { ok: false; reason: string } {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return { ok: false, reason: "sem percentagens definidas" };
  }
  const keys = Object.keys(params);
  const foreign = keys.filter((k) => !cityIds.includes(k));
  if (foreign.length) return { ok: false, reason: "inclui eventos que não são cidades deste Master" };
  const weights = cityIds.map((id) => Number(params[id] ?? 0));
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) return { ok: false, reason: "percentagem inválida" };
  const sum = weights.reduce((s, w) => s + w, 0);
  if (Math.abs(sum - 100) > 0.01) return { ok: false, reason: `as percentagens somam ${round2(sum)}%, não 100%` };
  return { ok: true, weights };
}

function sortCities(events: MasterRevenueEventLike[]): MasterRevenueEventLike[] {
  return [...events].sort((a, b) => {
    const da = String(a.date ?? "");
    const db = String(b.date ?? "");
    if (da !== db) return da < db ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function expandMasterRevenueToSplits<
  F extends MasterRevenueForecastLike,
  T extends MasterRevenueTransactionLike,
>(input: {
  events: MasterRevenueEventLike[];
  forecasts: F[];
  transactions?: T[];
  ticketBasis?: TicketShareBasis;
}): MasterRevenueSplitResult<F, T> {
  const { events, forecasts } = input;
  const transactions = input.transactions ?? [];
  const tb = input.ticketBasis ?? {};

  const citiesByMaster = new Map<string, MasterRevenueEventLike[]>();
  for (const ev of events) {
    if (!ev.parent_event_id) continue;
    const list = citiesByMaster.get(ev.parent_event_id) ?? [];
    list.push(ev);
    citiesByMaster.set(ev.parent_event_id, list);
  }

  const result: MasterRevenueSplitResult<F, T> = {
    forecastSlices: [],
    transactionSlices: [],
    shares: {},
    sourceForecastIds: new Set(),
    sourceTransactionIds: new Set(),
    ticketBasisUsed: {},
    warnings: [],
  };

  const weightsByForecast = new Map<string, { cityIds: string[]; weights: number[]; mode: RevenueSplitMode; masterId: string }>();

  for (const f of forecasts) {
    if (!isSplittableMasterRevenueLine(f)) continue;
    const cities = citiesByMaster.get(f.event_id);
    if (!cities || cities.length === 0) continue;
    const ordered = sortCities(cities);
    const cityIds = ordered.map((c) => c.id);
    const mode = f.revenue_split_mode as RevenueSplitMode;

    let weights: number[] | null = null;
    if (mode === "equal") {
      weights = cityIds.map(() => 1);
    } else if (mode === "fixed_pct") {
      const v = validateFixedPct(f.revenue_split_params, cityIds);
      if (v.ok) weights = v.weights;
      else {
        result.warnings.push({
          forecastId: f.id,
          masterEventId: f.event_id,
          code: "fixed_pct_invalido",
          message: `Repartição por % fixa inválida (${(v as { reason: string }).reason}): a receita fica só no Master.`,
        });
      }
    } else if (mode === "ticket_share") {
      const realized = new Set(tb.realizedEventIds ?? []);
      const allRealized = cityIds.every((id) => realized.has(id));
      const src = allRealized ? tb.realByEvent ?? {} : tb.forecastByEvent ?? {};
      const w = cityIds.map((id) => Math.max(0, Number(src[id] ?? 0)));
      if (w.reduce((s, x) => s + x, 0) > 0) {
        weights = w;
        result.ticketBasisUsed[f.id] = allRealized ? "real" : "forecast";
      } else {
        result.warnings.push({
          forecastId: f.id,
          masterEventId: f.event_id,
          code: "ticket_share_base_zero",
          message: "Repartição proporcional à bilheteira sem base (bilheteira zero): a receita fica só no Master.",
        });
      }
    }
    if (!weights) continue;

    const sumW = weights.reduce((s, w) => s + w, 0);
    result.shares[f.id] = Object.fromEntries(cityIds.map((id, i) => [id, weights![i] / sumW]));
    weightsByForecast.set(f.id, { cityIds, weights, mode, masterId: f.event_id });
    result.sourceForecastIds.add(f.id);

    const amounts = allocateCents(Number(f.amount || 0), weights);
    cityIds.forEach((cityId, i) => {
      result.forecastSlices.push({
        ...f,
        id: `${f.id}::rev::${cityId}`,
        event_id: cityId,
        amount: amounts[i],
        _revenue_via_master: true,
        _master_event_id: f.event_id,
        _master_forecast_id: f.id,
        _split_share: weights![i] / sumW,
        _revenue_split_mode: mode,
      });
    });
  }

  for (const t of transactions) {
    if (t.type != null && t.type !== "income") continue;
    if (!t.forecast_id) continue;
    const rule = weightsByForecast.get(t.forecast_id);
    if (!rule || rule.masterId !== t.event_id) continue;
    result.sourceTransactionIds.add(t.id);
    const amounts = allocateCents(Number(t.amount || 0), rule.weights);
    const sumW = rule.weights.reduce((s, w) => s + w, 0);
    rule.cityIds.forEach((cityId, i) => {
      result.transactionSlices.push({
        ...t,
        id: `${t.id}::rev::${cityId}`,
        event_id: cityId,
        amount: amounts[i],
        account_id: null,
        excluded_from_partner_settlement: t.excluded_from_partner_settlement === true || forecasts.find(f => f.id === t.forecast_id)?.excluded_from_partner_settlement === true,
        _revenue_via_master: true,
        _master_event_id: t.event_id,
        _master_forecast_id: t.forecast_id as string,
        _master_transaction_id: t.id,
        _split_share: rule.weights[i] / sumW,
        _revenue_split_mode: rule.mode,
      });
    });
  }

  return result;
}

/**
 * Regra única de perímetro. `scope`:
 *   • "root"  — agregado de família (Master + cidades): devolve as linhas
 *               originais (nunca as fatias).
 *   • "event" — vista de UM evento (cidade ou Master isolado): remove as
 *               origens repartidas e acrescenta as fatias dos `eventIds`.
 */
export function masterRevenueView<R extends { id: string; event_id: string }>(
  rows: R[],
  split: { sourceIds: Set<string>; slices: R[] },
  scope: "root" | "event",
  eventIds?: string[],
): R[] {
  const clean = rows.filter((r) => !(r as any)._revenue_via_master);
  if (scope === "root") return clean;
  const ids = eventIds ? new Set(eventIds) : null;
  return [
    ...clean.filter((r) => !split.sourceIds.has(r.id)),
    ...split.slices.filter((s) => (ids ? ids.has(s.event_id) : true)),
  ];
}
