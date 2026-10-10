/**
 * CARD DE LUCRO NA CAPA (#223, regra final do dono do negócio).
 *
 * NA CAPA MANDAM OS BOTÕES DOS CARDS, NÃO O CONTRATO.
 *
 * O card de Lucro é, sempre e sem exceção:
 *
 *   Lucro = (valor exibido no card de Receitas) − (valor exibido no card de Custos)
 *
 * Cada card exibe o valor segundo os SEUS próprios seletores — perímetro
 * (Realizado / Previsto + excedido / Forecast) e IVA (c/IVA · s/IVA),
 * independentes entre cards. O Lucro segue cegamente os dois números no ecrã,
 * no âmbito em vigor (Visão Global ou cidade). Se o utilizador muda um botão,
 * o Lucro muda com ele.
 *
 * `events.partner_calc_basis` NÃO decide nada na capa: é a regra do FECHO do
 * evento com o sócio e vive no Encontro de Contas. Aqui só serve para calcular
 * o `settlementResult` (via `computeContractBasisResult`) que acende o badge
 * discreto "≠ fecho" quando a capa e o fecho diferem — são perguntas diferentes.
 */
import {
  getPartnerCalcBasisLabel,
  getPartnerRevenueBase,
  ignoresOperationalExpenses,
  normalizePartnerCalcBasis,
  usesGrossExpenseAmounts,
  type PartnerCalcBasis,
} from "@/lib/partner-calc-basis";

export interface ContractResultTotals {
  revenueNet: number;
  revenueGross: number;
  expensesNet: number;
  expensesGross: number;
}

/**
 * PERÍMETRO em vigor nos cards (#223 correção): Realizado /
 * Previsto + excedido / Forecast — o modo escolhido em cada card.
 */
export interface ContractPerimeterModes {
  revenue?: string | null;
  expense?: string | null;
}

/** Vista de IVA ativa em cada card (independente entre cards). */
export interface ContractVatViews {
  revenue: boolean;
  expense: boolean;
}

const PERIMETER_LABEL: Record<string, string> = {
  realized: "Realizado",
  committed: "Previsto + excedido",
  forecast: "Forecast",
};

export interface ContractResult {
  calcBasis: PartnerCalcBasis;
  /** true ⇒ a despesa entra c/IVA (vista de IVA ATIVA no card de Custos). */
  withVat: boolean;
  revenueBase: number;
  expenseBase: number;
  result: number;
  /** Rótulo discreto para o card (perímetro + vistas de IVA escolhidas). */
  label: string;
  /** true ⇒ os cards de Receitas e Custos estão em perímetros diferentes. */
  perimeterMismatch: boolean;
  /**
   * Resultado do Encontro de Contas na base contratual (critério gravado no
   * evento) — só para o badge "≠ fecho". `null` enquanto não está calculado.
   */
  settlementResult: number | null;
  /** true ⇒ a vista dos cards difere da base do contrato (informativo). */
  differsFromSettlement: boolean;
  /** (#223, 09/10/2026) Subtração das vistas dos cards — só informativa. */
  viewResult: number;
  /** Rótulo da base contratual em que o Lucro é calculado. */
  contractLabel: string;
}

/**
 * Resultado do Encontro de Contas NA BASE CONTRATUAL — usado apenas como termo
 * de comparação para o badge "≠ fecho". É aqui que `partner_calc_basis` manda.
 */
export function computeContractBasisResult(
  totals: { revenueNet: number; expensesNet: number; expensesGross: number },
  basis?: string | null,
): number {
  const calcBasis = normalizePartnerCalcBasis(basis);
  const revenueBase = getPartnerRevenueBase(totals.revenueNet);
  const expenseBase = ignoresOperationalExpenses(calcBasis)
    ? 0
    : usesGrossExpenseAmounts(calcBasis)
      ? totals.expensesGross
      : totals.expensesNet;
  return revenueBase - expenseBase;
}

/**
 * LUCRO DA CAPA: subtração cega dos valores exibidos nos cards de Receitas e
 * Custos, nas vistas de IVA ativas em cada um. O contrato não participa.
 */
export function computeEventContractResult(
  totals: ContractResultTotals,
  vatViews: ContractVatViews,
  perimeters?: ContractPerimeterModes,
  settlementResult?: number | null,
  basis?: string | null,
): ContractResult {
  const calcBasis = normalizePartnerCalcBasis(basis);
  const revenueBase = vatViews.revenue ? totals.revenueGross : totals.revenueNet;
  const expenseBase = vatViews.expense ? totals.expensesGross : totals.expensesNet;

  const revMode = perimeters?.revenue ? (PERIMETER_LABEL[perimeters.revenue] ?? perimeters.revenue) : null;
  const expMode = perimeters?.expense ? (PERIMETER_LABEL[perimeters.expense] ?? perimeters.expense) : null;
  const perimeterMismatch = !!revMode && !!expMode && revMode !== expMode;

  const revVatLabel = vatViews.revenue ? "c/IVA" : "s/IVA";
  const expVatLabel = vatViews.expense ? "c/IVA" : "s/IVA";
  let label: string;
  if (perimeterMismatch) {
    label = `Receita (${revMode}) ${revVatLabel} − Despesa (${expMode}) ${expVatLabel}`;
  } else {
    label = `${revMode ? `${revMode} · ` : ""}Receita ${revVatLabel} − Despesa ${expVatLabel}`;
  }

  // (Adenda D-ERP213, 10/10/2026 — substitui a parte de 09/10): o "Resultado do
  // evento (antes de impostos)" é a subtração das VISTAS dos cards de Receitas e
  // Custos (IVA e perímetro escolhidos). A base do contrato (Encontro de Contas,
  // computeContractBasisResult) fica em `settlementResult`, mostrada por baixo.
  const viewResult = revenueBase - expenseBase;
  const result = viewResult;
  return {
    calcBasis,
    withVat: vatViews.expense,
    revenueBase,
    expenseBase,
    result,
    viewResult,
    contractLabel: getPartnerCalcBasisLabel(calcBasis),
    label,
    perimeterMismatch,
    settlementResult: settlementResult ?? null,
    differsFromSettlement:
      settlementResult != null &&
      Math.abs(viewResult - settlementResult) > 0.005,
  };
}
