/**
 * RESULTADO DO EVENTO NA BASE CONTRATUAL — fonte ÚNICA (#223).
 *
 * O card de Lucro da capa e o "Resultado" do Encontro de Contas passam a ler
 * daqui. A regra é a do contrato (`events.partner_calc_basis`), nunca a vista
 * de IVA escolhida nos cards de Receitas/Custos:
 *
 *   • `net_result`                → Receita s/IVA − Despesa s/IVA
 *   • `net_result_gross_expenses` → Receita s/IVA − Despesa c/IVA
 *   • `gross_revenue`            → Receita s/IVA (despesas operacionais ignoradas)
 *
 * Função pura: recebe os totais já calculados por `computeEventSettlementTotals`
 * (o mesmo bloco aritmético do Encontro de Contas) e não faz queries.
 */
import {
  getPartnerRevenueBase,
  ignoresOperationalExpenses,
  normalizePartnerCalcBasis,
  usesGrossExpenseAmounts,
  type PartnerCalcBasis,
} from "@/lib/partner-calc-basis";

export interface ContractResultTotals {
  revenueNet: number;
  expensesNet: number;
  expensesGross: number;
}

export interface ContractResult {
  calcBasis: PartnerCalcBasis;
  /** true ⇒ a despesa entra c/IVA (base do contrato). */
  withVat: boolean;
  revenueBase: number;
  expenseBase: number;
  result: number;
  /** Rótulo discreto para o card ("Receita s/IVA − Despesa c/IVA"). */
  label: string;
}

export function computeEventContractResult(
  totals: ContractResultTotals,
  basis?: string | null,
): ContractResult {
  const calcBasis = normalizePartnerCalcBasis(basis);
  const withVat = usesGrossExpenseAmounts(calcBasis);
  const revenueBase = getPartnerRevenueBase(totals.revenueNet);
  const expenseBase = ignoresOperationalExpenses(calcBasis)
    ? 0
    : (withVat ? totals.expensesGross : totals.expensesNet);
  return {
    calcBasis,
    withVat,
    revenueBase,
    expenseBase,
    result: revenueBase - expenseBase,
    label: ignoresOperationalExpenses(calcBasis)
      ? "Receita s/IVA (despesas ignoradas)"
      : `Receita s/IVA − Despesa ${withVat ? "c/IVA" : "s/IVA"}`,
  };
}
