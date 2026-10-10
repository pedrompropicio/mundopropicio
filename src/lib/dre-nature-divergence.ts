/**
 * #304 ponto 4 — trava contra o desaparecimento silencioso na DRE Empresarial.
 *
 * Uma transacção numa rubrica corporativa (código 10*) cuja natureza (type) não
 * bate com a da rubrica (ex.: receita na 10.3, que é de despesa) não entra em
 * nenhuma secção da DRE. Esta função só a conta para o aviso "Fora da DRE";
 * nunca altera os totais das secções. Espelha o invariante
 * `transacoes_natureza_divergente_da_rubrica` (excepção: receita em 10.6.03).
 */
export const DRE_INCOME_LEAF_EXCEPTIONS = ["10.6.03"];

export interface NatureDivergenceCategory { id: string; code: string; type: string }
export interface NatureDivergenceTx { id?: string; type: string; category_id?: string | null; amount: number | string }

export interface NatureDivergence {
  count: number;
  total: number;
  byType: { income: { count: number; total: number }; expense: { count: number; total: number } };
}

export function isNatureDivergent(t: NatureDivergenceTx, cat: NatureDivergenceCategory | undefined): boolean {
  if (!cat || !cat.code?.startsWith("10")) return false;
  if (t.type === cat.type) return false;
  if (t.type === "income" && DRE_INCOME_LEAF_EXCEPTIONS.includes(cat.code)) return false;
  return t.type === "income" || t.type === "expense";
}

export function computeNatureDivergence(
  txs: NatureDivergenceTx[],
  categories: NatureDivergenceCategory[],
): NatureDivergence {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const out: NatureDivergence = {
    count: 0,
    total: 0,
    byType: { income: { count: 0, total: 0 }, expense: { count: 0, total: 0 } },
  };
  for (const t of txs) {
    if (!isNatureDivergent(t, byId.get(t.category_id || ""))) continue;
    const v = Number(t.amount) || 0;
    out.count++;
    out.total += v;
    const k = t.type as "income" | "expense";
    out.byType[k].count++;
    out.byType[k].total += v;
  }
  out.total = Math.round(out.total * 100) / 100;
  out.byType.income.total = Math.round(out.byType.income.total * 100) / 100;
  out.byType.expense.total = Math.round(out.byType.expense.total * 100) / 100;
  return out;
}
