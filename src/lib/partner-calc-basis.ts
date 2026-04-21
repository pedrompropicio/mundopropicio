export type PartnerCalcBasis = "net_result" | "net_result_gross_expenses" | "gross_revenue";

type PartnerCalcBasisInput = PartnerCalcBasis | "net" | "gross" | null | undefined | string;

export function normalizePartnerCalcBasis(value?: PartnerCalcBasisInput): PartnerCalcBasis {
  if (value === "gross_revenue") return "gross_revenue";
  if (value === "net_result_gross_expenses" || value === "gross") return "net_result_gross_expenses";
  return "net_result";
}

export function getPartnerCalcBasisLabel(value?: PartnerCalcBasisInput): string {
  switch (normalizePartnerCalcBasis(value)) {
    case "net_result_gross_expenses":
      return "Receitas s/ IVA − Despesas c/ IVA";
    case "gross_revenue":
      return "Receitas s/ IVA";
    case "net_result":
    default:
      return "Receitas s/ IVA − Despesas s/ IVA";
  }
}

export function usesGrossExpenseAmounts(value?: PartnerCalcBasisInput): boolean {
  const normalized = normalizePartnerCalcBasis(value);
  return normalized === "net_result_gross_expenses" || normalized === "gross_revenue";
}

export function ignoresOperationalExpenses(value?: PartnerCalcBasisInput): boolean {
  return normalizePartnerCalcBasis(value) === "gross_revenue";
}

export function getPartnerRevenueBase(revenueNet: number): number {
  return revenueNet;
}

export function getPartnerExpenseBase(
  value: PartnerCalcBasisInput,
  expenseNet: number,
  expenseGross: number,
): number {
  if (ignoresOperationalExpenses(value)) return 0;
  return usesGrossExpenseAmounts(value) ? expenseGross : expenseNet;
}