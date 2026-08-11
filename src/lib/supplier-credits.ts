/**
 * Créditos de fornecedor — helpers partilhados.
 *
 * Semântica de DRE: o custo fica SEMPRE no evento de origem. O crédito não gera
 * nenhum movimento de DRE/BP — apenas reduz a saída de caixa quando é abatido
 * num pagamento (transaction_payments.credit_amount, compensado em
 * src/lib/account-balance.ts).
 */
import { supabase } from "@/integrations/supabase/client";

export type SupplierCredit = {
  id: string;
  supplier_id: string;
  amount: number;
  used_amount: number;
  reason: string;
  document_ref: string | null;
  valid_until: string | null;
  status: string;
  file_url: string | null;
  origin_event_id: string | null;
  created_at: string;
  created_by: string;
  notes: string | null;
};

export const creditRemaining = (c: { amount: any; used_amount: any }) =>
  Math.round((Number(c.amount) - Number(c.used_amount)) * 100) / 100;

export function isCreditExpired(validUntil: string | null | undefined): boolean {
  if (!validUntil) return false;
  const [y, m, d] = validUntil.split("-").map(Number);
  const now = new Date();
  const todayNum = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  return y * 10000 + m * 100 + d < todayNum;
}

export function isCreditUsable(c: { amount: any; used_amount: any; status: string; valid_until: string | null }) {
  return c.status === "active" && creditRemaining(c) > 0 && !isCreditExpired(c.valid_until);
}

/** Marca como 'expired' os créditos activos com validade ultrapassada. */
export async function expireStaleCredits(): Promise<void> {
  try {
    await (supabase as any).rpc("expire_supplier_credits");
  } catch {
    /* best effort — não bloqueia a UI */
  }
}

/** Créditos utilizáveis (activos, com saldo, não expirados) de um fornecedor. */
export async function fetchAvailableCredits(supplierId: string): Promise<SupplierCredit[]> {
  const { data, error } = await supabase
    .from("supplier_credits" as any)
    .select("id, supplier_id, amount, used_amount, reason, document_ref, valid_until, status, file_url, origin_event_id, created_at, created_by, notes")
    .eq("supplier_id", supplierId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).filter(isCreditUsable) as SupplierCredit[];
}

/**
 * Abate transacional de um crédito (RPC apply_supplier_credit):
 * valida saldo/validade, registra o uso, actualiza o saldo do crédito e
 * preenche credit_amount no pagamento. Tudo ou nada.
 */
export async function applySupplierCredit(args: {
  creditId: string;
  transactionId: string;
  amount: number;
  paymentId?: string | null;
}): Promise<void> {
  const { error } = await (supabase as any).rpc("apply_supplier_credit", {
    p_credit_id: args.creditId,
    p_transaction_id: args.transactionId,
    p_amount: args.amount,
    p_payment_id: args.paymentId ?? null,
  });
  if (error) throw error;
}
