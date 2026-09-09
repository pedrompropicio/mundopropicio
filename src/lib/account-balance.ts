/**
 * Account balance adjustments for non-cash deductions on payments.
 *
 * Background: transactions.paid_amount is stored GROSS (preserved for BP/DRE
 * accuracy). However, the actual cash outflow on an expense is reduced by:
 *   - withholding_amount (IRS retido na fonte — repassado ao Estado, não sai
 *     em dinheiro da conta)
 *   - credit_amount (crédito do fornecedor abatido — não sai em dinheiro)
 *
 * These deductions are tracked per-payment in `transaction_payments`. This
 * helper aggregates them per account so balance calculations can add them
 * back to the naive (gross) balance to reflect the real cash position.
 *
 * Usage:
 *   const adj = await fetchAccountCashAdjustments();
 *   const realBalance = grossBalance + (adj.get(accountId) ?? 0);
 */
import { supabase } from "@/integrations/supabase/client";

export type AccountCashAdjustments = Map<string, number>;

/** Data de corte do saldo inicial, por conta (`initial_balance_date`). */
export type AccountCutoffs = Map<string, string | null | undefined>;

/** Data efetiva de um movimento: payment_date com fallback para date. */
export function effectivePaymentDate(t: {
  payment_date?: string | null;
  date?: string | null;
}): string {
  return String(t.payment_date ?? t.date ?? "").slice(0, 10);
}

/**
 * Um movimento conta no saldo? Só se não for anterior ou igual à data de corte
 * do saldo inicial. Sem data de corte, conta sempre.
 */
export function countsAfterCutoff(
  t: { payment_date?: string | null; date?: string | null },
  cutoff?: string | null
): boolean {
  if (!cutoff) return true;
  const eff = effectivePaymentDate(t);
  if (!eff) return true;
  return eff > cutoff.slice(0, 10);
}

/** Constrói o mapa de datas de corte a partir de uma lista de contas. */
export function buildAccountCutoffs(
  accounts: Array<{ id: string; initial_balance_date?: string | null }>
): AccountCutoffs {
  const map: AccountCutoffs = new Map();
  for (const a of accounts ?? []) map.set(a.id, a.initial_balance_date ?? null);
  return map;
}

/**
 * Returns a Map<account_id, adjustment> where adjustment = sum of
 * (withholding_amount + credit_amount) of all transaction_payments rows
 * tied to that account. Add this value to the gross balance.
 *
 * @param accountIds Optional filter; when omitted, returns adjustments for
 *                   every account that has at least one payment with a
 *                   non-zero withholding or credit component.
 * @param cutoffs    Optional Map<account_id, initial_balance_date>: pagamentos
 *                   com data igual ou anterior ao corte são história e ficam
 *                   fora do ajuste.
 * @param bounds     Janela opcional sobre a data efetiva do pagamento, para
 *                   relatórios por período (Extrato). Não substitui o corte:
 *                   os dois filtros aplicam-se em conjunto.
 */
export async function fetchAccountCashAdjustments(
  accountIds?: string[],
  cutoffs?: AccountCutoffs,
  bounds?: { gte?: string; lt?: string; lte?: string }
): Promise<AccountCashAdjustments> {
  let query = supabase
    .from("transaction_payments")
    .select("account_id, withholding_amount, credit_amount, payment_date")
    .not("account_id", "is", null);

  if (accountIds && accountIds.length > 0) {
    query = query.in("account_id", accountIds);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[account-balance] fetchAccountCashAdjustments error", error);
    return new Map();
  }

  const map: AccountCashAdjustments = new Map();
  for (const row of data ?? []) {
    if (!row.account_id) continue;
    if (!countsAfterCutoff(row as any, cutoffs?.get(row.account_id))) continue;
    if (bounds) {
      const eff = effectivePaymentDate(row as any);
      if (bounds.gte && (!eff || eff < bounds.gte.slice(0, 10))) continue;
      if (bounds.lt && (!eff || eff >= bounds.lt.slice(0, 10))) continue;
      if (bounds.lte && (!eff || eff > bounds.lte.slice(0, 10))) continue;
    }
    const w = Number(row.withholding_amount ?? 0);
    const c = Number(row.credit_amount ?? 0);
    const inc = w + c;
    if (inc === 0) continue;
    map.set(row.account_id, (map.get(row.account_id) ?? 0) + inc);
  }
  return map;
}


/**
 * Fonte única do saldo de uma conta financeira.
 *
 * Devolve `null` quando a conta está configurada como "Sem Controle de Saldo"
 * (`skip_balance_check = true`) — nesse caso o interface mostra
 * "Sem controlo de saldo" em vez de um número.
 *
 * Caso contrário: initial_balance + Σ movimentos (income soma, expense
 * subtrai, sempre por `paid_amount`) + ajustes não-monetários (retenção IRS +
 * créditos de fornecedor) vindos de fetchAccountCashAdjustments.
 *
 * DATA DE CORTE (`initial_balance_date`): quando preenchida, `initial_balance`
 * é o saldo ao FECHO desse dia; movimentos com data efetiva
 * (COALESCE(payment_date, date)) igual ou anterior ao corte já estão dentro
 * dele e por isso não voltam a somar. Com corte a NULL nada muda.
 *
 * NÃO filtra `reversed_at` nem `status`: a RPC reverse_transaction põe
 * paid_amount = 0 nos estornos cash_refund, e nos estornos supplier_credit o
 * dinheiro saiu mesmo da conta.
 */
export function computeAccountBalance(
  account: {
    id: string;
    initial_balance?: number | null;
    initial_balance_date?: string | null;
    skip_balance_check?: boolean | null;
  },
  transactions: Array<{
    account_id: string;
    type: string;
    paid_amount?: number | null;
    payment_date?: string | null;
    date?: string | null;
  }>,
  adjustments?: Map<string, number>
): number | null {
  if (account.skip_balance_check) return null;

  const cutoff = account.initial_balance_date ?? null;
  let balance = Number(account.initial_balance ?? 0);
  for (const t of transactions) {
    if (t.account_id !== account.id) continue;
    if (!countsAfterCutoff(t, cutoff)) continue;
    const amt = Number(t.paid_amount ?? 0);
    balance += t.type === "income" ? amt : -amt;
  }
  balance += adjustments?.get(account.id) ?? 0;
  return balance;
}
