import { supabase } from "@/integrations/supabase/client";

/**
 * #284 — AVISO DE DUPLICAÇÃO DE FATURA no lançamento/edição de transações mãe.
 *
 * Regra (a): mesmo company_id + mesmo supplier_id + mesma invoice_ref
 *            (normalizada: trim, maiúsculas, espaços colapsados).
 * Regra (b): só quando a invoice_ref vem vazia — mesmo company_id + mesmo
 *            supplier_id + mesmo amount (±0,01) + date a menos de 30 dias.
 *
 * Só mães vivas: parent_transaction_id IS NULL e reversed_at IS NULL.
 * Em edição exclui a própria transação.
 *
 * É AVISO, NUNCA BLOQUEIO: uma fatura pode dar várias linhas (#29) e as
 * proformas repetem a ref de propósito. O ecrã pede confirmação e deixa gravar.
 */

export interface DuplicateCheckInput {
  companyId: string | null | undefined;
  supplierId: string | null | undefined;
  invoiceRef: string | null | undefined;
  amount: number | null | undefined;
  /** YYYY-MM-DD */
  date: string | null | undefined;
  excludeTransactionId?: string | null;
  /** true → só a regra (a); sem ref preenchida não avisa. */
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
  rule: "invoice_ref" | "amount_date";
}

export function normalizeInvoiceRef(ref: string | null | undefined): string {
  return (ref ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

const DAY_MS = 86_400_000;

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return t.toISOString().slice(0, 10);
}

/** Indica se o input tem dados suficientes para correr alguma regra. */
export function canCheckDuplicates(input: DuplicateCheckInput): boolean {
  if (!input.companyId || !input.supplierId) return false;
  if (normalizeInvoiceRef(input.invoiceRef)) return true;
  if (input.onlyInvoiceRefRule) return false;
  return Number(input.amount) > 0 && /^\d{4}-\d{2}-\d{2}/.test(input.date ?? "");
}

export async function findDuplicateTransactions(input: DuplicateCheckInput): Promise<DuplicateCandidate[]> {
  if (!canCheckDuplicates(input)) return [];
  const ref = normalizeInvoiceRef(input.invoiceRef);

  let q = supabase
    .from("transactions")
    .select("id, description, date, amount, paid_amount, status, invoice_ref, events(name)")
    .eq("company_id", input.companyId as string)
    .eq("supplier_id", input.supplierId as string)
    .is("parent_transaction_id", null)
    .is("reversed_at", null);
  if (input.excludeTransactionId) q = q.neq("id", input.excludeTransactionId);

  let rule: DuplicateCandidate["rule"];
  if (ref) {
    rule = "invoice_ref";
    // Pré-filtro tolerante no servidor; a comparação exata normalizada é feita abaixo.
    q = q.not("invoice_ref", "is", null).neq("invoice_ref", "");
  } else {
    rule = "amount_date";
    const date = String(input.date).slice(0, 10);
    const amount = Number(input.amount);
    q = q
      .gt("date", addDays(date, -30))
      .lt("date", addDays(date, 30))
      .gte("amount", amount - 0.01)
      .lte("amount", amount + 0.01);
  }

  const { data, error } = await q.limit(1000);
  if (error) throw error;

  return ((data ?? []) as any[])
    .filter((t) => (rule === "invoice_ref" ? normalizeInvoiceRef(t.invoice_ref) === ref : true))
    .map((t) => ({
      id: t.id,
      description: t.description ?? null,
      date: t.date ?? null,
      amount: Number(t.amount ?? 0),
      paid_amount: Number(t.paid_amount ?? 0),
      status: t.status ?? null,
      event_name: t.events?.name ?? null,
      rule,
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
