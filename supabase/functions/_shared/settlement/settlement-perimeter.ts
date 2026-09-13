/**
 * PERÍMETRO DA RAIZ — D25 decisão 5, adenda (g3) (#146).
 *
 * O resultado do EVENTO, em qualquer ecrã ou documento, é o perímetro do
 * fechamento RAIZ: totais do evento MENOS as linhas (transações e linhas de BP)
 * marcadas com um fechamento que não seja a raiz. Essas linhas são exclusivas
 * desse fechamento (ex.: "Fechamento MP + EIN") e nunca entram em receita,
 * custo, lucro, margem, DRE, card, Resumo, Fecho ou Portal do evento.
 *
 * Linhas marcadas com a PRÓPRIA raiz contam normalmente (a raiz é o evento).
 *
 * Regra única, reutilizada por toda a app — não replicar em ecrãs.
 */

export interface PerimeterLine {
  event_settlement_id?: string | null;
}

export type RootSettlementIds = Set<string> | readonly string[] | string | null | undefined;

function toSet(roots: RootSettlementIds): Set<string> {
  if (!roots) return new Set();
  if (typeof roots === "string") return new Set([roots]);
  return roots instanceof Set ? roots : new Set(roots);
}

/**
 * true ⇒ a linha é exclusiva de um fechamento filho e fica FORA do resultado
 * do evento.
 */
export function isOutsideRootPerimeter(line: PerimeterLine, roots: RootSettlementIds): boolean {
  const id = line?.event_settlement_id;
  if (!id) return false;
  return !toSet(roots).has(id);
}

/** Mantém só as linhas do perímetro da raiz. */
export function keepRootPerimeter<T extends PerimeterLine>(lines: T[], roots: RootSettlementIds): T[] {
  const set = toSet(roots);
  if (lines.length === 0) return lines;
  return lines.filter((l) => !isOutsideRootPerimeter(l, set));
}

/** Só as linhas exclusivas de fechamentos filhos (para o bloco informativo). */
export function pickOutsideRootPerimeter<T extends PerimeterLine>(
  lines: T[],
  roots: RootSettlementIds,
): T[] {
  const set = toSet(roots);
  return lines.filter((l) => isOutsideRootPerimeter(l, set));
}
