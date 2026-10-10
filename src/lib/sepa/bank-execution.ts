/**
 * #37 ponto 3 (D-ERP244) — retorno do banco para as listas SEPA.
 *
 * Motor puro: para cada exportação (payment_list_sepa_exports) diz, linha a
 * linha, se o banco a executou. É SUGESTÃO: nada aqui grava, liquida ou muda
 * status/paid_amount. A confirmação humana vai para payment_list_bank_executions.
 *
 * O que o ficheiro gera (pain001.ts): MsgId (= msg_id gravado), EndToEndId
 * `PLnnn-<8 hex da transação>` e RmtInf/Ustrd com o descritivo. O extrato do
 * Santander NÃO devolve o EndToEndId: um lote aparece como UMA linha a débito
 * ("LOTE TRF CRED SEPA+…") pelo total. Por isso há duas camadas:
 *   (1) lote — débito = total da exportação ao cêntimo, data em [exportação, +10d];
 *       se a linha já estiver ligada (matched_sepa_export_id) reutiliza-se.
 *       Uma linha do banco serve uma só exportação (re-exportações iguais ficam
 *       "por executar").
 *   (2) linha — débito = valor da transação ao cêntimo, mesma janela, e o
 *       descritivo contém o nome do beneficiário (ou o EndToEndId).
 * Sem linhas do extrato a cobrir a data da exportação → "sem extrato".
 */
export const SEPA_RETURN_WINDOW_DAYS = 10;

export type BankExecState = "executado" | "por_executar" | "sem_extrato";

export interface BeSepaExport {
  id: string;
  payment_list_id: string;
  exported_at: string;
  total_amount: number;
  transaction_ids: string[];
}
export interface BeBankLine {
  id: string;
  booking_date: string;
  amount: number;
  description: string;
  matched_sepa_export_id?: string | null;
  matched_transaction_id?: string | null;
}
export interface BeTx {
  id: string;
  amount: number;
  supplier_name?: string | null;
}
export interface BeLineResult {
  sepa_export_id: string;
  transaction_id: string;
  state: BankExecState;
  match_kind: "lote" | "linha" | null;
  bank_line: BeBankLine | null;
  /** true = já ligado por humano (conciliação existente ou confirmação gravada) */
  reused: boolean;
}

const day = (s: string) => s.slice(0, 10);
const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const cents = (n: number) => Math.round(Math.abs(Number(n) || 0) * 100);

export const normBankText = (s: unknown) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

/** EndToEndId que o pain001 gera para a transação na posição idx (0-based). */
export const sepaEndToEndId = (txId: string, idx: number) =>
  `PL${String(idx + 1).padStart(3, "0")}-${txId.replace(/-/g, "").slice(0, 8)}`;

/** Nome do beneficiário presente no descritivo do banco (primeiras 2 palavras ≥3 letras). */
export function descriptionHasBeneficiary(description: string, name: string | null | undefined): boolean {
  const d = normBankText(description);
  const words = normBankText(name).split(" ").filter((w) => w.length >= 3 && !["LDA", "SA", "UNIPESSOAL"].includes(w));
  if (words.length === 0) return false;
  return words.slice(0, 2).every((w) => d.includes(w));
}

export function matchSepaBankExecutions(args: {
  exports: BeSepaExport[];
  lines: BeBankLine[];
  txById: Map<string, BeTx>;
  /** primeira booking_date importada da conta (null = nenhum extrato) */
  coverageFrom: string | null;
  coverageTo: string | null;
  /** confirmações já gravadas: chave `${export}|${tx}` → bank_statement_line_id */
  confirmed?: Map<string, string>;
}): BeLineResult[] {
  const { exports, lines, txById, coverageFrom, coverageTo } = args;
  const confirmed = args.confirmed ?? new Map<string, string>();
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const debits = lines.filter((l) => Number(l.amount) < 0);
  const usedLines = new Set<string>();
  const out: BeLineResult[] = [];

  // Ordem: as exportações já ligadas pela conciliação primeiro, depois por data.
  const ordered = [...exports].sort((a, b) => {
    const la = debits.some((l) => l.matched_sepa_export_id === a.id) ? 0 : 1;
    const lb = debits.some((l) => l.matched_sepa_export_id === b.id) ? 0 : 1;
    return la - lb || a.exported_at.localeCompare(b.exported_at) || a.id.localeCompare(b.id);
  });

  for (const e of ordered) {
    const from = day(e.exported_at);
    const to = addDays(from, SEPA_RETURN_WINDOW_DAYS);
    const inWindow = (l: BeBankLine) => l.booking_date >= from && l.booking_date <= to && !usedLines.has(l.id);
    const covered = !!coverageFrom && !!coverageTo && coverageFrom <= from && coverageTo >= from;

    // (1) lote
    const reusedBatch = debits.find((l) => l.matched_sepa_export_id === e.id && !usedLines.has(l.id));
    const batch = reusedBatch ?? debits.find((l) => inWindow(l) && !l.matched_sepa_export_id && cents(l.amount) === cents(e.total_amount));
    if (batch) usedLines.add(batch.id);

    e.transaction_ids.forEach((txId, idx) => {
      const key = `${e.id}|${txId}`;
      const conf = confirmed.get(key);
      if (conf && lineById.get(conf)) {
        const l = lineById.get(conf)!;
        out.push({ sepa_export_id: e.id, transaction_id: txId, state: "executado", match_kind: cents(l.amount) === cents(e.total_amount) ? "lote" : "linha", bank_line: l, reused: true });
        return;
      }
      if (batch) {
        out.push({ sepa_export_id: e.id, transaction_id: txId, state: "executado", match_kind: "lote", bank_line: batch, reused: !!reusedBatch });
        return;
      }
      const tx = txById.get(txId);
      const reusedTx = debits.find((l) => l.matched_transaction_id === txId && inWindow(l));
      const e2e = normBankText(sepaEndToEndId(txId, idx));
      const single = reusedTx ?? (tx
        ? debits.find((l) => inWindow(l) && !l.matched_transaction_id && cents(l.amount) === cents(tx.amount)
            && (descriptionHasBeneficiary(l.description, tx.supplier_name) || normBankText(l.description).includes(e2e)))
        : undefined);
      if (single) {
        usedLines.add(single.id);
        out.push({ sepa_export_id: e.id, transaction_id: txId, state: "executado", match_kind: "linha", bank_line: single, reused: !!reusedTx });
        return;
      }
      out.push({ sepa_export_id: e.id, transaction_id: txId, state: covered ? "por_executar" : "sem_extrato", match_kind: null, bank_line: null, reused: false });
    });
  }
  return out;
}

/**
 * Estado por transação da lista (união das exportações): executado ganha a
 * por_executar, que ganha a sem_extrato.
 */
export function stateByTransaction(results: BeLineResult[]): Map<string, BeLineResult> {
  const rank: Record<BankExecState, number> = { executado: 0, por_executar: 1, sem_extrato: 2 };
  const m = new Map<string, BeLineResult>();
  for (const r of results) {
    const cur = m.get(r.transaction_id);
    if (!cur || rank[r.state] < rank[cur.state]) m.set(r.transaction_id, r);
  }
  return m;
}

export const BANK_EXEC_LABEL: Record<BankExecState, string> = {
  executado: "Executado pelo banco",
  por_executar: "Por executar",
  sem_extrato: "Sem extrato para o período",
};
