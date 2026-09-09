/**
 * Conciliação bancária — motor puro, em camadas.
 *
 * Regra absoluta: a conciliação NUNCA altera transações. Não liquida, não muda
 * status, não escreve `paid_amount`. Só LIGA a linha do banco ao que já existe
 * no sistema. O extrato é um facto externo; a verdade financeira continua nas
 * transações.
 *
 * Corre por esta ordem e pára na primeira camada que casa:
 *   (a) lote SEPA — `payment_list_sepa_exports` pelo total e pela referência
 *       do `msg_id` presente na descrição do banco;
 *   (b) valor exato — mesmo montante absoluto contra `paid_amount` de uma
 *       transação da mesma conta, com data efetiva a ±5 dias;
 *   (c) descrição por semelhança — Dice ≥ 0,8 com o valor a bater ao cêntimo.
 */
import { normalizeForMatch, stringSimilarity } from "@/lib/string-similarity";
import { extractDateTokens } from "@/lib/bank-statement/parse-santander";

/**
 * Data dentro do `msg_id` do lote (PAGAMENTOS-MP-11082026-12080959 → 11/08/2026),
 * nas duas formas que o extrato do Santander usa.
 */
export function extractMsgIdDate(msgId: string | null | undefined): { ddmmyyyy: string; ddmmyy: string } | null {
  const m = (msgId || "").match(/(\d{2})(\d{2})(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return { ddmmyyyy: `${dd}${mm}${yyyy}`, ddmmyy: `${dd}${mm}${yyyy.slice(2)}` };
}

export const SEPA_BATCH_MARKER = "LOTE TRF CRED SEPA+";
export const DICE_THRESHOLD = 0.8;
export const AMOUNT_WINDOW_DAYS = 5;
const CENT = 0.01;

export type MatchLayer = "sepa" | "amount" | "description";

export interface ReconcileLineInput {
  key: string;
  description: string;
  amount: number;
  bookingDate: string;
  valueDate?: string | null;
}

export interface ReconcileTransaction {
  id: string;
  description: string | null;
  paid_amount: number | null;
  payment_date: string | null;
  date: string | null;
  status?: string | null;
  supplier_name?: string | null;
}

export interface ReconcileSepaExport {
  id: string;
  payment_list_id: string;
  msg_id: string;
  total_amount: number;
  transaction_ids: string[];
}

export interface ReconcileMatch {
  key: string;
  layer: MatchLayer;
  matched_transaction_id: string | null;
  matched_payment_list_id: string | null;
  matched_sepa_export_id: string | null;
  /** Todas as transações cobertas pela linha (um lote SEPA cobre N). */
  transactionIds: string[];
  /** Nº de exportações SEPA empatadas da MESMA lista (dupla geração). */
  sepaExportCount?: number;
  /** Soma dos `paid_amount` (bruto) das transações cobertas. */
  systemGross?: number;
  /** Bruto do sistema − líquido do banco = retenção na fonte. */
  retention?: number;
}

export interface ReconcileResult {
  matches: Map<string, ReconcileMatch>;
  /** Ids de transações já explicadas por alguma linha. */
  explainedTransactionIds: Set<string>;
  counts: { sepa: number; amount: number; description: number; unmatched: number };
  /** Retenção na fonte total apurada nos lotes SEPA casados. */
  retentionTotal: number;
}

function effectiveDate(t: { payment_date?: string | null; date?: string | null }): string {
  return String(t.payment_date ?? t.date ?? "").slice(0, 10);
}

function daysApart(a: string, b: string): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const da = new Date(`${a}T12:00:00`).getTime();
  const db = new Date(`${b}T12:00:00`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Number.POSITIVE_INFINITY;
  return Math.abs(da - db) / 86_400_000;
}

/**
 * As camadas correm como PASSAGENS sobre todas as linhas, não linha a linha.
 * Uma transação só pode explicar UMA linha: o que o lote SEPA consome (todas as
 * transações do `transaction_ids`) fica fora das camadas seguintes, mesmo que a
 * linha do lote apareça depois no ficheiro. Uma linha já casada também não
 * volta a ser candidata.
 */
export function reconcileStatement(
  lines: ReconcileLineInput[],
  transactions: ReconcileTransaction[],
  sepaExports: ReconcileSepaExport[],
  opts?: { preUsedTransactionIds?: Iterable<string> },
): ReconcileResult {
  const matches = new Map<string, ReconcileMatch>();
  const usedTransactionIds = new Set<string>(opts?.preUsedTransactionIds ?? []);
  const usedExportIds = new Set<string>();
  const counts = { sepa: 0, amount: 0, description: 0, unmatched: 0 };
  let retentionTotal = 0;
  const grossById = new Map(transactions.map((t) => [t.id, Math.abs(Number(t.paid_amount ?? 0))]));

  // ---- Passagem (a): lotes SEPA ------------------------------------------
  for (const line of lines) {
    if (!line.description.toUpperCase().includes(SEPA_BATCH_MARKER)) continue;
    const abs = Math.abs(line.amount);
    const byAmount = sepaExports.filter(
      (e) => !usedExportIds.has(e.id) && Math.abs(Number(e.total_amount ?? 0) - abs) <= CENT,
    );
    // O `msg_id` (PAGAMENTOS-MP-11082026-12080959) não viaja inteiro na
    // descrição do banco: o que viaja é a DATA, ora DDMMAAAA ora abreviada.
    const tokens = extractDateTokens(line.description);
    const byDate = byAmount.filter((e) => {
      const d = extractMsgIdDate(e.msg_id);
      if (!d) return false;
      return tokens.some((t) => t === d.ddmmyyyy || t === d.ddmmyy || t === d.ddmmyyyy.slice(0, 6));
    });
    const pool = byDate.length > 0 ? byDate : byAmount;
    // Empate entre exportações da MESMA lista de pagamento é dupla geração,
    // não ambiguidade: são o mesmo lote. Só recusa se as listas diferirem.
    const listIds = new Set(pool.map((e) => e.payment_list_id));
    if (pool.length === 0 || listIds.size !== 1) continue;
    const chosen = pool[0];
    pool.forEach((e) => usedExportIds.add(e.id));
    const ids = Array.from(new Set(pool.flatMap((e) => (e.transaction_ids ?? []).filter(Boolean))));
    ids.forEach((id) => usedTransactionIds.add(id));
    const systemGross =
      Math.round(ids.reduce((acc, id) => acc + (grossById.get(id) ?? 0), 0) * 100) / 100;
    // O banco paga o LÍQUIDO; o sistema registou o BRUTO. A diferença é a
    // retenção na fonte — não é divergência.
    const retention = Math.round((systemGross - abs) * 100) / 100;
    if (Math.abs(retention) > CENT) retentionTotal += retention;
    matches.set(line.key, {
      key: line.key,
      layer: "sepa",
      matched_transaction_id: null,
      matched_payment_list_id: chosen.payment_list_id,
      matched_sepa_export_id: chosen.id,
      transactionIds: ids,
      sepaExportCount: pool.length,
      systemGross,
      retention: Math.abs(retention) > CENT ? retention : 0,
    });
    counts.sepa++;
  }

  // ---- Passagem (b): valor exato dentro da janela de cinco dias ----------
  for (const line of lines) {
    if (matches.has(line.key)) continue;
    const abs = Math.abs(line.amount);
    const candidates = transactions.filter((t) => {
      if (usedTransactionIds.has(t.id)) return false;
      const paid = Math.abs(Number(t.paid_amount ?? 0));
      if (paid <= 0 || Math.abs(paid - abs) > CENT) return false;
      return daysApart(effectiveDate(t), line.bookingDate) <= AMOUNT_WINDOW_DAYS;
    });
    if (candidates.length === 0) continue;
    const chosen = candidates.sort(
      (a, b) => daysApart(effectiveDate(a), line.bookingDate) - daysApart(effectiveDate(b), line.bookingDate),
    )[0];
    usedTransactionIds.add(chosen.id);
    matches.set(line.key, {
      key: line.key,
      layer: "amount",
      matched_transaction_id: chosen.id,
      matched_payment_list_id: null,
      matched_sepa_export_id: null,
      transactionIds: [chosen.id],
    });
    counts.amount++;
  }

  // ---- Passagem (c): descrição por semelhança (Dice ≥ 0,8) --------------
  for (const line of lines) {
    if (matches.has(line.key)) continue;
    const abs = Math.abs(line.amount);
    let best: { t: ReconcileTransaction; score: number } | null = null;
    for (const t of transactions) {
      if (usedTransactionIds.has(t.id)) continue;
      const paid = Math.abs(Number(t.paid_amount ?? 0));
      if (Math.abs(paid - abs) > CENT) continue;
      const candidateText = [t.description ?? "", t.supplier_name ?? ""].join(" ");
      const score = Math.max(
        stringSimilarity(line.description, t.description ?? ""),
        stringSimilarity(line.description, candidateText),
      );
      if (score >= DICE_THRESHOLD && (!best || score > best.score)) best = { t, score };
    }
    if (!best) continue;
    usedTransactionIds.add(best.t.id);
    matches.set(line.key, {
      key: line.key,
      layer: "description",
      matched_transaction_id: best.t.id,
      matched_payment_list_id: null,
      matched_sepa_export_id: null,
      transactionIds: [best.t.id],
    });
    counts.description++;
  }

  counts.unmatched = lines.filter((l) => !matches.has(l.key)).length;

  return {
    matches,
    explainedTransactionIds: usedTransactionIds,
    counts,
    retentionTotal: Math.round(retentionTotal * 100) / 100,
  };
}

/**
 * O lado inverso: transações marcadas como pagas na conta, com data efetiva
 * dentro do período do extrato, que não ficaram ligadas a nenhuma linha do
 * banco. É a classe de erro dos Bombeiros — dinheiro dado como pago que nunca
 * saiu da conta. Tem o mesmo peso que as linhas por explicar.
 *
 * `cutoffDate` (a `initial_balance_date` da conta) exclui o que já está dentro
 * do saldo implantado: essas transações não se conciliam, por definição.
 */
export function findTransactionsWithoutBankLine(
  transactions: ReconcileTransaction[],
  explainedIds: Set<string>,
  periodFrom: string,
  periodTo: string,
  cutoffDate?: string | null,
): ReconcileTransaction[] {
  const cutoff = cutoffDate ? cutoffDate.slice(0, 10) : null;
  return transactions.filter((t) => {
    if (explainedIds.has(t.id)) return false;
    const eff = effectiveDate(t);
    if (!eff) return false;
    if (cutoff && eff <= cutoff) return false;
    return eff >= periodFrom.slice(0, 10) && eff <= periodTo.slice(0, 10);
  });
}

