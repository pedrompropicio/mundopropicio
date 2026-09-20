/**
 * Resultado do evento na base contratual (#223, corrigido).
 *
 * O critério do contrato (`events.partner_calc_basis`) decide UMA coisa só: se a
 * despesa entra c/IVA ou s/IVA. O PERÍMETRO (Realizado / Previsto + excedido /
 * Forecast) vem dos cards de Receitas e de Custos, que reportam os seus totais
 * nas duas bases de IVA via `onPerimeterChange`. Este hook é um wrapper fino e
 * puro sobre `computeEventContractResult` — não faz queries.
 */
import { useMemo } from "react";
import { computeEventContractResult, type ContractResult } from "@/lib/event-contract-result";

export interface ContractPerimeterInput {
  /** Total do perímetro na base líquida (s/IVA). */
  net: number;
  /** Total do perímetro na base bruta (c/IVA). */
  gross: number;
  /** Modo efetivo do card: "realized" | "committed" | "forecast". */
  mode: string;
}

export interface EventContractResultState {
  contract: ContractResult | null;
  isLoading: boolean;
}

export function useEventContractResult(
  partnerCalcBasis: string | null | undefined,
  income: ContractPerimeterInput | null,
  expense: ContractPerimeterInput | null,
): EventContractResultState {
  const contract = useMemo(() => {
    if (!income || !expense) return null;
    return computeEventContractResult(
      { revenueNet: income.net, expensesNet: expense.net, expensesGross: expense.gross },
      partnerCalcBasis,
      { revenue: income.mode, expense: expense.mode },
    );
  }, [partnerCalcBasis, income, expense]);

  return { contract, isLoading: false };
}
