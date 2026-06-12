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
    .select("account_id, withholding_amount, credit_amount, status")
    .not("account_id", "is", null)
    // Excluir parcelas estornadas (V1 cash_refund): o dinheiro voltou,
    // logo o withholding/credito também deixa de contar. V2 supplier_credit
    // mantém status='paid' por isso é correctamente incluído aqui.
    .neq("status", "reversed");

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
