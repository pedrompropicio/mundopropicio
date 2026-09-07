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

/**
 * Returns a Map<account_id, adjustment> where adjustment = sum of
 * (withholding_amount + credit_amount) of all transaction_payments rows
 * tied to that account. Add this value to the gross balance.
 *
 * @param accountIds Optional filter; when omitted, returns adjustments for
 *                   every account that has at least one payment with a
 *                   non-zero withholding or credit component.
 */
export async function fetchAccountCashAdjustments(
  accountIds?: string[]
): Promise<AccountCashAdjustments> {
  let query = supabase
    .from("transaction_payments")
    .select("account_id, withholding_amount, credit_amount")
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
 * NÃO filtra `reversed_at` nem `status`: a RPC reverse_transaction põe
 * paid_amount = 0 nos estornos cash_refund, e nos estornos supplier_credit o
 * dinheiro saiu mesmo da conta.
 */
export function computeAccountBalance(
  account: { id: string; initial_balance?: number | null; skip_balance_check?: boolean | null },
  transactions: Array<{ account_id: string; type: string; paid_amount?: number | null }>,
  adjustments?: Map<string, number>
): number | null {
  if (account.skip_balance_check) return null;

  let balance = Number(account.initial_balance ?? 0);
  for (const t of transactions) {
    if (t.account_id !== account.id) continue;
    const amt = Number(t.paid_amount ?? 0);
    balance += t.type === "income" ? amt : -amt;
  }
  balance += adjustments?.get(account.id) ?? 0;
  return balance;
}
