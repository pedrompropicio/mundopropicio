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
}

export interface ReconcileResult {
  matches: Map<string, ReconcileMatch>;
  /** Ids de transações já explicadas por alguma linha. */
  explainedTransactionIds: Set<string>;
  counts: { sepa: number; amount: number; description: number; unmatched: number };
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

export function reconcileStatement(
  lines: ReconcileLineInput[],
  transactions: ReconcileTransaction[],
  sepaExports: ReconcileSepaExport[],
): ReconcileResult {
  const matches = new Map<string, ReconcileMatch>();
  const usedTransactionIds = new Set<string>();
  const usedExportIds = new Set<string>();
  const counts = { sepa: 0, amount: 0, description: 0, unmatched: 0 };

  for (const line of lines) {
    const abs = Math.abs(line.amount);
    const desc = normalizeForMatch(line.description);

    // (a) Lote SEPA
    if (line.description.toUpperCase().includes(SEPA_BATCH_MARKER)) {
      const byAmount = sepaExports.filter(
        (e) => !usedExportIds.has(e.id) && Math.abs(Number(e.total_amount ?? 0) - abs) <= CENT,
      );
      const byRef = byAmount.filter((e) => e.msg_id && desc.includes(normalizeForMatch(e.msg_id)));
      const chosen = byRef[0] ?? (byAmount.length === 1 ? byAmount[0] : undefined);
      if (chosen) {
        usedExportIds.add(chosen.id);
        const ids = (chosen.transaction_ids ?? []).filter(Boolean);
        ids.forEach((id) => usedTransactionIds.add(id));
        matches.set(line.key, {
          key: line.key,
          layer: "sepa",
          matched_transaction_id: null,
          matched_payment_list_id: chosen.payment_list_id,
          matched_sepa_export_id: chosen.id,
          transactionIds: ids,
        });
        counts.sepa++;
        continue;
      }
    }

    // (b) Valor exato dentro da janela de cinco dias
    const amountCandidates = transactions.filter((t) => {
      if (usedTransactionIds.has(t.id)) return false;
      const paid = Math.abs(Number(t.paid_amount ?? 0));
      if (paid <= 0 || Math.abs(paid - abs) > CENT) return false;
      return daysApart(effectiveDate(t), line.bookingDate) <= AMOUNT_WINDOW_DAYS;
    });
    if (amountCandidates.length > 0) {
      // Empate: fica a mais próxima na data.
      const chosen = amountCandidates.sort(
        (a, b) =>
          daysApart(effectiveDate(a), line.bookingDate) - daysApart(effectiveDate(b), line.bookingDate),
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
      continue;
    }

    // (c) Descrição por semelhança (Dice ≥ 0,8) com valor ao cêntimo
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
    if (best) {
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
      continue;
    }

    counts.unmatched++;
  }

  return { matches, explainedTransactionIds: usedTransactionIds, counts };
}

/**
 * O lado inverso: transações marcadas como pagas na conta, com data efetiva
 * dentro do período do extrato, que não ficaram ligadas a nenhuma linha do
 * banco. É a classe de erro dos Bombeiros — dinheiro dado como pago que nunca
 * saiu da conta. Tem o mesmo peso que as linhas por explicar.
 */
export function findTransactionsWithoutBankLine(
  transactions: ReconcileTransaction[],
  explainedIds: Set<string>,
  periodFrom: string,
  periodTo: string,
): ReconcileTransaction[] {
  return transactions.filter((t) => {
    if (explainedIds.has(t.id)) return false;
    const eff = effectiveDate(t);
    if (!eff) return false;
    return eff >= periodFrom.slice(0, 10) && eff <= periodTo.slice(0, 10);
  });
}
