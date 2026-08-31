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

/**
 * BASE DE APURAMENTO DA DESPESA POR SÓCIO (D-ERP9).
 *
 * A MP produz em Portugal com artistas brasileiros: um sócio com sede no Brasil
 * não recupera IVA português (o custo dele é o valor c/IVA), um sócio português
 * recupera (o custo é a base líquida). O mesmo evento pode ter os dois.
 *
 * `partnerOverride` = `event_partners.expense_includes_iva`:
 *   • null  → herda a base contratual do evento
 *   • true  → apura sempre c/IVA
 *   • false → apura sempre s/IVA
 *
 * A base `gross_revenue` do evento (ignora despesas operacionais) é decidida ao
 * nível do evento e PREVALECE — um sócio não passa a ter despesas num evento
 * que as ignora.
 */
export function partnerUsesGrossExpenses(
  eventBasis: PartnerCalcBasisInput,
  partnerOverride?: boolean | null,
): boolean {
  if (partnerOverride === true || partnerOverride === false) return partnerOverride;
  return usesGrossExpenseAmounts(eventBasis);
}

/** Base efetiva de despesa do sócio, reutilizando `getPartnerExpenseBase`. */
export function getPartnerEffectiveExpenseBase(
  eventBasis: PartnerCalcBasisInput,
  partnerOverride: boolean | null | undefined,
  expenseNet: number,
  expenseGross: number,
): number {
  if (ignoresOperationalExpenses(eventBasis)) return 0;
  return getPartnerExpenseBase(
    partnerUsesGrossExpenses(eventBasis, partnerOverride)
      ? "net_result_gross_expenses"
      : "net_result",
    expenseNet,
    expenseGross,
  );
}

/** Rótulo curto da base efetiva do sócio, com a origem da regra. */
export function describePartnerExpenseBasis(
  eventBasis: PartnerCalcBasisInput,
  partnerOverride?: boolean | null,
): string {
  if (ignoresOperationalExpenses(eventBasis)) return "Despesas ignoradas (base do evento)";
  const gross = partnerUsesGrossExpenses(eventBasis, partnerOverride);
  const origin = partnerOverride === true || partnerOverride === false
    ? "regra própria do sócio"
    : "contrato do evento";
  return `Despesas ${gross ? "c/IVA" : "s/IVA"} · ${origin}`;
}
