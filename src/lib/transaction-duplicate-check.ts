import { supabase } from "@/integrations/supabase/client";

/**
 * #284 — AVISO DE DUPLICAÇÃO no lançamento/edição de transações mãe.
 * Mecanismo ÚNICO (absorveu a guarda de setembro do TransactionFormModal,
 * "incidente 2026-09", checkDuplicatesAndSubmit).
 *
 * Regras CUMULATIVAS — corre cada uma sempre que houver dados para ela e
 * devolve a união sem repetidos (cada candidata com a 1.ª regra que a apanhou):
 *  • invoice_ref  — mesmo company_id + supplier_id + invoice_ref normalizada
 *                   (trim, maiúsculas, espaços colapsados). Valor pode diferir
 *                   (fatura repartida, #29) — avisa, não bloqueia.
 *  • amount_date  — mesmo company_id + supplier_id + amount (±0,01) + date a
 *                   menos de 30 dias. Corre MESMO com ref preenchida (caso
 *                   Montaditos: uma linha com ref, a outra sem).
 *  • description  — mesma descrição (ilike) no mesmo evento, quando o valor
 *                   coincide (±0,01) OU o fornecedor é o mesmo. Sem a condição
 *                   antiga que descartava quando só uma linha tinha ref.
 *
 * Só mães vivas: parent_transaction_id IS NULL e reversed_at IS NULL.
 * Em edição exclui a própria transação. `onlyInvoiceRefRule` liga só a 1.ª.
 *
 * É AVISO, NUNCA BLOQUEIO: o ecrã pede confirmação e deixa gravar.
 */

export type DuplicateRule = "invoice_ref" | "amount_date" | "description";

export interface DuplicateCheckInput {
  companyId: string | null | undefined;
  supplierId: string | null | undefined;
  invoiceRef: string | null | undefined;
  amount: number | null | undefined;
  /** YYYY-MM-DD */
  date: string | null | undefined;
  description?: string | null;
  eventId?: string | null;
  excludeTransactionId?: string | null;
  /** true → só a regra invoice_ref; sem ref preenchida não avisa. */
  onlyInvoiceRefRule?: boolean;
}

export interface DuplicateCandidate {
  id: string;
  description: string | null;
  date: string | null;
  amount: number;
  paid_amount: number;
  status: string | null;
  event_name: string | null;
  rule: DuplicateRule;
}

/** Linha de transação tal como vem da base (para o matcher puro). */
export interface DuplicateRow {
  id: string;
  company_id?: string | null;
  supplier_id: string | null;
  invoice_ref: string | null;
  description: string | null;
  amount: number | string | null;
  paid_amount?: number | string | null;
  date: string | null;
  status?: string | null;
  event_id?: string | null;
  parent_transaction_id?: string | null;
  reversed_at?: string | null;
  events?: { name?: string | null } | null;
}

export function normalizeInvoiceRef(ref: string | null | undefined): string {
  return (ref ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

const normDesc = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const DAY_MS = 86_400_000;
const isIsoDate = (d: string | null | undefined) => /^\d{4}-\d{2}-\d{2}/.test(d ?? "");
const dayNum = (d: string) => {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, dd) / DAY_MS;
};
function addDays(date: string, days: number): string {
  return new Date((dayNum(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

function activeRules(input: DuplicateCheckInput) {
  const hasCompany = !!input.companyId;
  const ref = normalizeInvoiceRef(input.invoiceRef);
  const refRule = hasCompany && !!input.supplierId && !!ref;
  if (input.onlyInvoiceRefRule) return { ref, refRule, amountRule: false, descRule: false };
  const amountRule = hasCompany && !!input.supplierId && Number(input.amount) > 0 && isIsoDate(input.date);
  const descRule = hasCompany && !!normDesc(input.description);
  return { ref, refRule, amountRule, descRule };
}

export function canCheckDuplicates(input: DuplicateCheckInput): boolean {
  const r = activeRules(input);
  return r.refRule || r.amountRule || r.descRule;
}

/** Matcher PURO: aplica as três regras a um conjunto de linhas. Testável sem base. */
export function matchDuplicateCandidates(input: DuplicateCheckInput, rows: DuplicateRow[]): DuplicateCandidate[] {
  const r = activeRules(input);
  const amount = Number(input.amount) || 0;
  const desc = normDesc(input.description);
  const seen = new Map<string, DuplicateCandidate>();

  for (const t of rows) {
    if (!t?.id || seen.has(t.id)) continue;
    if (input.excludeTransactionId && t.id === input.excludeTransactionId) continue;
    if (t.parent_transaction_id || t.reversed_at) continue;
    if (input.companyId && t.company_id && t.company_id !== input.companyId) continue;

    const sameSupplier = !!input.supplierId && t.supplier_id === input.supplierId;
    const sameAmount = Math.abs(Number(t.amount ?? 0) - amount) < 0.01;
    let rule: DuplicateRule | null = null;

    if (r.refRule && sameSupplier && normalizeInvoiceRef(t.invoice_ref) === r.ref) rule = "invoice_ref";
    else if (
      r.amountRule && sameSupplier && sameAmount && isIsoDate(t.date) &&
      Math.abs(dayNum(String(t.date)) - dayNum(String(input.date))) < 30
    ) rule = "amount_date";
    else if (
      r.descRule && normDesc(t.description) === desc &&
      (!input.eventId || t.event_id === input.eventId) &&
      (sameAmount || sameSupplier)
    ) rule = "description";

    if (!rule) continue;
    seen.set(t.id, {
      id: t.id,
      description: t.description ?? null,
      date: t.date ?? null,
      amount: Number(t.amount ?? 0),
      paid_amount: Number(t.paid_amount ?? 0),
      status: t.status ?? null,
      event_name: t.events?.name ?? null,
      rule,
    });
  }
  return [...seen.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

const SELECT =
  "id, company_id, supplier_id, invoice_ref, description, amount, paid_amount, date, status, event_id, parent_transaction_id, reversed_at, events(name)";

export async function findDuplicateTransactions(input: DuplicateCheckInput): Promise<DuplicateCandidate[]> {
  const r = activeRules(input);
  if (!r.refRule && !r.amountRule && !r.descRule) return [];

  const base = () => {
    let q = supabase
      .from("transactions")
      .select(SELECT)
      .eq("company_id", input.companyId as string)
      .is("parent_transaction_id", null)
      .is("reversed_at", null);
    if (input.excludeTransactionId) q = q.neq("id", input.excludeTransactionId);
    return q;
  };

  const queries: PromiseLike<{ data: any[] | null; error: any }>[] = [];
  if (r.refRule) {
    queries.push(base().eq("supplier_id", input.supplierId as string).not("invoice_ref", "is", null).limit(1000) as any);
  }
  if (r.amountRule) {
    const date = String(input.date).slice(0, 10);
    const amount = Number(input.amount);
    queries.push(
      base()
        .eq("supplier_id", input.supplierId as string)
        .gt("date", addDays(date, -30))
        .lt("date", addDays(date, 30))
        .gte("amount", amount - 0.01)
        .lte("amount", amount + 0.01)
        .limit(500) as any,
    );
  }
  if (r.descRule) {
    let q = base().ilike("description", String(input.description).trim());
    if (input.eventId) q = q.eq("event_id", input.eventId);
    queries.push(q.limit(50) as any);
  }

  const results = await Promise.all(queries);
  const rows: DuplicateRow[] = [];
  for (const res of results) {
    if (res.error) throw res.error;
    rows.push(...((res.data ?? []) as DuplicateRow[]));
  }
  return matchDuplicateCandidates(input, rows);
}
