import { useEventCostBasis, type CostExpenseSource, type EventCostBasis } from "@/hooks/useEventCostBasis";

export type FechoExpenseSource = CostExpenseSource;

/**
 * O critério do Fecho é exactamente o critério de custo do evento — gravado em
 * `events.cost_expense_source` / `events.cost_include_overhead` (D25 e2).
 * `withVat` é derivado de `events.partner_calc_basis` e não é editável aqui.
 */
export type FechoBasis = EventCostBasis;

export function useFechoBasis(eventId: string, partnerCalcBasis?: string | null): FechoBasis {
  return useEventCostBasis(eventId, partnerCalcBasis);
}


/** Resumo textual do critério — vai para o cabeçalho dos PDFs. */
export function describeFechoBasis(b: FechoBasis): string {
  const parts = [
    `Despesas ${b.withVat ? "c/IVA" : "s/IVA"}`,
    b.expenseSource === "committed" ? "base: previsto + excedido" : "base: realizado",
    b.includeOverhead ? "com overhead" : "sem overhead",
  ];
  return parts.join(" · ");
}
