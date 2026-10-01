/**
 * Integração da sessão de camarim — helpers puros (D16 + DR-2026-09-02-D2).
 *
 * Espelham as contas da edge function `close-camarim-session` para que o modal
 * mostre ANTES do clique se a sessão cabe na linha de BP ou se é preciso elevar
 * a verba. A edge function continua a ser a autoridade: se ela discordar
 * (ex.: outra transação aprovada entretanto), a resposta 422 `budget_excess`
 * aparece no próprio modal.
 */

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CamarimBpLine {
  id: string;
  description: string | null;
  specification: string | null;
  amount: number;
  status: string | null;
  /** Realizado = transações approved/paid da linha, sem transitórias/excluídas/estornadas/ocultas. */
  realized: number;
}

export interface CamarimBpFit {
  previsto: number;
  utilizado: number;
  disponivel: number;
  estaSessao: number;
  excess: number;
  fits: boolean;
  /** Verba mínima da linha para caber (igual ao `suggested_amount` da edge fn). */
  suggestedAmount: number;
}

export function lineLabel(l: Pick<CamarimBpLine, "description" | "specification">) {
  return [l.description, l.specification].filter(Boolean).join(" · ") || "(sem descrição)";
}

/** Proposta: a linha aprovada com mais verba disponível; sem aprovadas, a única que exista. */
export function proposeBpLine(lines: CamarimBpLine[]): string | null {
  if (lines.length === 0) return null;
  const approved = lines.filter((l) => (l.status ?? "approved") === "approved");
  const pool = approved.length > 0 ? approved : lines.length === 1 ? lines : [];
  if (pool.length === 0) return null;
  return pool.reduce((best, l) =>
    round2(l.amount - l.realized) > round2(best.amount - best.realized) ? l : best,
  ).id;
}

export function computeBpFit(line: Pick<CamarimBpLine, "amount" | "realized">, sessionBase: number): CamarimBpFit {
  const previsto = round2(line.amount);
  const utilizado = round2(line.realized);
  const estaSessao = round2(sessionBase);
  const over = round2(utilizado + estaSessao - previsto);
  return {
    previsto,
    utilizado,
    disponivel: round2(previsto - utilizado),
    estaSessao,
    excess: over > 0 ? over : 0,
    fits: over <= 0,
    suggestedAmount: round2(utilizado + estaSessao),
  };
}

/** Base líquida dos itens a integrar — mesma fórmula da edge function. */
export function sessionBaseAmount(items: Array<{ base_amount?: number | null; total_amount?: number | null; iva_amount?: number | null }>) {
  return round2(
    items.reduce(
      (s, it) => s + (Number(it.base_amount ?? 0) || Number(it.total_amount ?? 0) - Number(it.iva_amount ?? 0)),
      0,
    ),
  );
}

export interface IntegrateErrorView {
  message: string;
  details: string[];
  budgetExcess: Array<{ forecast_id: string; suggested_amount: number; excess: number; line_amount: number; realized: number; to_approve: number }> | null;
}

/** Converte qualquer resposta de erro da `close-camarim-session` em texto legível. */
export function parseIntegrateError(status: number | null, body: unknown, fallback = "Erro inesperado ao integrar."): IntegrateErrorView {
  const b = (body && typeof body === "object" ? body : null) as any;
  const details: string[] = Array.isArray(b?.errors) ? b.errors.map((e: unknown) => String(e)) : [];
  const budgetExcess = Array.isArray(b?.budget_excess) && b.budget_excess.length > 0 ? b.budget_excess : null;
  let message: string =
    (typeof b?.error === "string" && b.error) ||
    (typeof b?.message === "string" && b.message) ||
    (typeof body === "string" && body.trim() ? body.trim().slice(0, 300) : "") ||
    "";
  if (!message) {
    if (details.length > 0) message = "A integração falhou.";
    else if (status && status >= 500) message = `Erro no servidor (HTTP ${status}). Nada foi integrado — tenta de novo ou avisa o Pedro.`;
    else if (status) message = `A integração foi recusada (HTTP ${status}).`;
    else message = fallback;
  }
  return { message, details, budgetExcess };
}
