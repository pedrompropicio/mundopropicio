/**
 * #339 A1 — regras PURAS das linhas de BP com fórmula (receita e custo).
 * O cálculo continua só no motor `bp-formula.ts` (D-ERP149); aqui ficam as
 * guardas de quem pode ter fórmula, quando recalcula, o chão em receita e o
 * patch permitido no recálculo.
 */

export type FormulaLineType = "income" | "expense";

/** "receita" ou "custo" conforme o tipo da linha. */
export function formulaLineNoun(type: string | null | undefined): "receita" | "custo" {
  return type === "income" ? "receita" : "custo";
}

/** Rubricas de receita cobertas por linha sintética (bilheteira, A&B). */
export const FORMULA_FORBIDDEN_INCOME_PREFIXES = ["1.1.01", "1.1.03"] as const;

function hasPrefix(code: string, prefix: string): boolean {
  return code === prefix || code.startsWith(prefix + ".");
}

/**
 * Motivo para recusar fórmula na linha, ou null se é permitida.
 * Receita de bilheteira (1.1.01) e de A&B (1.1.03) já têm linha sintética.
 */
export function formulaForbiddenReason(type: string | null | undefined, code: string | null | undefined): string | null {
  if (type !== "income") return null;
  const c = String(code ?? "").trim();
  if (FORMULA_FORBIDDEN_INCOME_PREFIXES.some((p) => hasPrefix(c, p))) {
    const what = hasPrefix(c, "1.1.01") ? "bilheteira (1.1.01)" : "A&B (1.1.03)";
    return `Fórmula não permitida em receita de ${what}: esta rubrica já é calculada pela linha sintética do BP.`;
  }
  return null;
}

/** Só recalcula em eventos abertos: concluídos ou com fechamento selado ficam parados. */
export function canRecalculateFormulas(args: { status: string | null | undefined; hasSealedSettlement: boolean }): boolean {
  if (args.hasSealedSettlement) return false;
  return args.status !== "completed";
}

/** Realizado de uma linha de RECEITA: transações income válidas ligadas à linha. */
export function incomeRealizedFromTx(rows: any[]): number {
  return (rows ?? [])
    .filter((t) => t?.type === "income" && (t.status === "approved" || t.status === "paid"))
    .filter((t) => !t.is_transitory && !t.exclude_from_result && !t.reversed_at && !t.is_hidden)
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

/** Chão #240 em receita: o calculado nunca desce abaixo do realizado. */
export function applyRevenueFloor(calculated: number, realized: number): { amount: number; floorHit: boolean } {
  const r = Math.round(Number(realized || 0) * 100) / 100;
  if (calculated < r - 0.005) return { amount: r, floorHit: true };
  return { amount: calculated, floorHit: false };
}

/** Campos que o recálculo pode escrever além do amount. Nada mais. */
export const FORMULA_RECALC_PATCH_KEYS = ["formula_value", "formula_params"] as const;

export function buildFormulaRecalcPatch(
  currentParams: Record<string, any> | null | undefined,
  calc: { text: string; amount: number },
  written: number,
  floorHit: boolean,
  nowIso: string,
): { formula_value: number; formula_params: Record<string, any> } {
  return {
    formula_value: written,
    formula_params: { ...(currentParams ?? {}), last_text: calc.text, last_recalc_at: nowIso, last_calculated: calc.amount, floor_hit: floorHit },
  };
}
