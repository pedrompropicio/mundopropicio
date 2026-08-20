import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { normalizePartnerCalcBasis, usesGrossExpenseAmounts } from "@/lib/partner-calc-basis";

/**
 * CRITÉRIO DE CUSTO ÚNICO POR EVENTO.
 *
 * Antes existiam dois seletores independentes (card da capa e Fecho) com
 * defaults diferentes — o mesmo evento mostrava dois custos. Este store é a
 * única fonte de verdade: card, Encontro de Contas e Geral do evento leem e
 * escrevem aqui, e mexer num reflete-se no outro em tempo real.
 *
 * Defaults: overhead LIGADO (é custo real imputado ao evento) e IVA a partir
 * de `events.partner_calc_basis` (critério contratual gravado). O toggle NUNCA
 * escreve em `partner_calc_basis`.
 *
 * Persistência: localStorage por user+evento (uma chave por campo, não por ecrã).
 */

export type CostExpenseSource = "realized" | "committed";

export interface EventCostBasisState {
  withVat: boolean;
  includeOverhead: boolean;
  expenseSource: CostExpenseSource;
}

export interface EventCostBasis extends EventCostBasisState {
  setWithVat: (v: boolean) => void;
  setIncludeOverhead: (v: boolean) => void;
  setExpenseSource: (v: CostExpenseSource) => void;
}

type Field = "vat" | "overhead" | "expsource";

const storageKey = (scope: string, field: Field) => `event-cost-basis-${scope}-${field}`;

const cache = new Map<string, EventCostBasisState>();
const seeded = new Set<string>();
const listeners = new Map<string, Set<() => void>>();

function readRaw(scope: string, field: Field): string | null {
  try { return localStorage.getItem(storageKey(scope, field)); } catch { return null; }
}
function writeRaw(scope: string, field: Field, value: string) {
  try { localStorage.setItem(storageKey(scope, field), value); } catch { /* noop */ }
}

function initState(scope: string, seedVat: boolean): EventCostBasisState {
  const vat = readRaw(scope, "vat");
  const oh = readRaw(scope, "overhead");
  const src = readRaw(scope, "expsource");
  return {
    withVat: vat === "1" ? true : vat === "0" ? false : seedVat,
    includeOverhead: oh === "0" ? false : true, // default ON
    expenseSource: src === "committed" ? "committed" : "realized",
  };
}

function getState(scope: string, seedVat: boolean): EventCostBasisState {
  let s = cache.get(scope);
  if (!s) {
    s = initState(scope, seedVat);
    cache.set(scope, s);
  }
  return s;
}

function emit(scope: string) {
  listeners.get(scope)?.forEach((l) => l());
}

function patchState(scope: string, patch: Partial<EventCostBasisState>) {
  const cur = cache.get(scope);
  if (!cur) return;
  const next = { ...cur, ...patch };
  cache.set(scope, next);
  if (patch.withVat !== undefined) writeRaw(scope, "vat", next.withVat ? "1" : "0");
  if (patch.includeOverhead !== undefined) writeRaw(scope, "overhead", next.includeOverhead ? "1" : "0");
  if (patch.expenseSource !== undefined) writeRaw(scope, "expsource", next.expenseSource);
  emit(scope);
}

/**
 * @param eventId    Evento (ou master, no caso do Fecho da turnê).
 * @param partnerCalcBasis `events.partner_calc_basis` — semente do toggle de IVA.
 */
export function useEventCostBasis(eventId: string, partnerCalcBasis?: string | null): EventCostBasis {
  const { user } = useAuth();
  const scope = `${user?.id ?? "anon"}-${eventId}`;
  const seedVat = usesGrossExpenseAmounts(normalizePartnerCalcBasis(partnerCalcBasis));

  const [state, setLocal] = useState<EventCostBasisState>(() => getState(scope, seedVat));

  useEffect(() => {
    setLocal(getState(scope, seedVat));
    const set = listeners.get(scope) ?? new Set<() => void>();
    listeners.set(scope, set);
    const cb = () => setLocal(cache.get(scope)!);
    set.add(cb);
    return () => { set.delete(cb); };
    // seedVat é só semente inicial — não re-subscrever quando muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // `partner_calc_basis` chega por query. Se o utilizador ainda não escolheu
  // IVA para este evento, aplica a semente contratual (uma única vez).
  useEffect(() => {
    if (partnerCalcBasis === undefined) return;
    if (seeded.has(scope)) return;
    seeded.add(scope);
    if (readRaw(scope, "vat") === null) patchState(scope, { withVat: seedVat });
  }, [scope, partnerCalcBasis, seedVat]);

  return {
    ...state,
    setWithVat: useCallback((v: boolean) => patchState(scope, { withVat: v }), [scope]),
    setIncludeOverhead: useCallback((v: boolean) => patchState(scope, { includeOverhead: v }), [scope]),
    setExpenseSource: useCallback((v: CostExpenseSource) => patchState(scope, { expenseSource: v }), [scope]),
  };
}
