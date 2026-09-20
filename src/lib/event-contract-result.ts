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

/**
 * PERÍMETRO em vigor nos cards (#223 correção): o critério do contrato decide
 * APENAS a base de IVA da despesa; o perímetro (Realizado / Previsto + excedido /
 * Forecast) vem do modo escolhido nos cards de Receitas e de Custos — nunca um
 * lado previsto com o outro real.
 */
export interface ContractPerimeterModes {
  revenue?: string | null;
  expense?: string | null;
}

const PERIMETER_LABEL: Record<string, string> = {
  realized: "Realizado",
  committed: "Previsto + excedido",
  forecast: "Forecast",
};

export interface ContractResult {
  calcBasis: PartnerCalcBasis;
  /** true ⇒ a despesa entra c/IVA (base do contrato). */
  withVat: boolean;
  revenueBase: number;
  expenseBase: number;
  result: number;
  /** Rótulo discreto para o card (perímetro + base de IVA). */
  label: string;
  /** true ⇒ os cards de Receitas e Custos estão em perímetros diferentes. */
  perimeterMismatch: boolean;
  /**
   * Resultado do Encontro de Contas na base contratual (critério gravado no
   * evento) — só para o badge "≠ fecho". `null` enquanto não está calculado.
   */
  settlementResult: number | null;
  /** true ⇒ o Lucro (perímetro dos cards) difere do Resultado do Encontro. */
  differsFromSettlement: boolean;
}

export function computeEventContractResult(
  totals: ContractResultTotals,
  basis?: string | null,
  perimeters?: ContractPerimeterModes,
  settlementResult?: number | null,
): ContractResult {
  const calcBasis = normalizePartnerCalcBasis(basis);
  const withVat = usesGrossExpenseAmounts(calcBasis);
  const ignoresExpenses = ignoresOperationalExpenses(calcBasis);
  const revenueBase = getPartnerRevenueBase(totals.revenueNet);
  const expenseBase = ignoresExpenses
    ? 0
    : (withVat ? totals.expensesGross : totals.expensesNet);

  const revMode = perimeters?.revenue ? (PERIMETER_LABEL[perimeters.revenue] ?? perimeters.revenue) : null;
  const expMode = perimeters?.expense ? (PERIMETER_LABEL[perimeters.expense] ?? perimeters.expense) : null;
  const perimeterMismatch = !!revMode && !!expMode && revMode !== expMode;

  let label: string;
  if (ignoresExpenses) {
    label = revMode ? `${revMode} · Receita s/IVA (despesas ignoradas)` : "Receita s/IVA (despesas ignoradas)";
  } else if (perimeterMismatch) {
    label = `Receita (${revMode}) s/IVA − Despesa (${expMode}) ${withVat ? "c/IVA" : "s/IVA"}`;
  } else {
    label = `${revMode ? `${revMode} · ` : ""}Receita s/IVA − Despesa ${withVat ? "c/IVA" : "s/IVA"}`;
  }

  return {
    calcBasis,
    withVat,
    revenueBase,
    expenseBase,
    result: revenueBase - expenseBase,
    label,
    perimeterMismatch,
  };
}
