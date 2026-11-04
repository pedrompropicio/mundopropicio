import {
  computeEventCostOnBasis,
  computeOutsideBpExcess,
  isApprovedOperationalForecast,
  isApprovedOverheadForecast,
  sumLines,
  type EventCostOnBasisArgs,
} from "@/lib/event-cost-basis";
import { isValidFechoTransaction, withoutIncomeTax } from "@/lib/fecho-filters";

/** Operacionais e OH por evento; excedido committed na família (#223, decisão A). */
export function computeEventCardCost(args: EventCostOnBasisArgs & { eventId: string }) {
  const { eventId, forecasts, transactions, mode, withVat, includeOverhead } = args;
  const byEvent = new Map<string, { f: any[]; t: any[] }>();
  const bucket = (evId: string) => {
    let b = byEvent.get(evId);
    if (!b) { b = { f: [], t: [] }; byEvent.set(evId, b); }
    return b;
  };
  for (const f of forecasts) bucket(f.event_id ?? eventId).f.push(f);
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    bucket(t.event_id ?? eventId).t.push(t);
  }

  let total = 0, overhead = 0, excess = 0, approvedCount = 0;
  for (const b of byEvent.values()) {
    const cost = computeEventCostOnBasis({
      forecasts: b.f, transactions: b.t, mode, withVat, includeOverhead,
    });
    // Encontro: event-settlement-inputs.ts:97–102 soma OH também em realizado.
    // O predicado partilhado retém só OH aprovado, não transitório e activo;
    // exclude_from_result não exclui OH. IVA arredondado linha a linha.
    const realizedOverhead = mode === "realized" && includeOverhead
      ? sumLines(withoutIncomeTax(b.f).filter(isApprovedOverheadForecast), withVat)
      : 0;
    total += cost.total + realizedOverhead;
    overhead += cost.overhead + realizedOverhead;
    excess += cost.excess;
    approvedCount += cost.approvedCount;
  }
  if (mode === "committed") {
    // Exceção só do card (#223, decisão A 6621117257): o excedido usa o
    // perímetro inteiro como o Encontro; o motor e a regra #217 mantêm-se.
    const familyExcess = computeOutsideBpExcess(
      withoutIncomeTax(forecasts).filter(isApprovedOperationalForecast),
      withoutIncomeTax(transactions).filter(t => t.type === "expense" && isValidFechoTransaction(t)),
      withVat,
    );
    total += familyExcess - excess;
    excess = familyExcess;
  }
  return { total, overhead, excess, approvedCount };
}
