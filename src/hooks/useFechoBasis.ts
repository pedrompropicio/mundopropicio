import { useEventCostBasis, type CostExpenseSource } from "@/hooks/useEventCostBasis";

export type FechoExpenseSource = CostExpenseSource;

export interface FechoBasis {
  /** true = despesas c/IVA (bruto); false = base líquida. Escolha livre do utilizador. */
  withVat: boolean;
  setWithVat: (v: boolean) => void;
  /** Overhead entra no resultado do acerto (default ON — é custo real do evento). */
  includeOverhead: boolean;
  setIncludeOverhead: (v: boolean) => void;
  /** Base da despesa: realizado ou previsto + excedido (max previsto/realizado por rubrica). */
  expenseSource: FechoExpenseSource;
  setExpenseSource: (v: FechoExpenseSource) => void;
}

/**
 * Wrapper fino sobre `useEventCostBasis` — o critério é ÚNICO por evento e
 * partilhado com o card da capa. O valor inicial de `withVat` vem de
 * `events.partner_calc_basis`; o toggle NUNCA escreve nesse campo.
 */
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
