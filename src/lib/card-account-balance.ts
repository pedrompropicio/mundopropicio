/**
 * Saldo REAL da conta de um cartão pré-pago.
 *
 * Fonte única de verdade = módulo Contas: `initial_balance` (que é também onde
 * o "ajuste de saldo" da conta é persistido) + Σ movimentos da conta
 * (paid_amount, income soma / expense subtrai) + ajustes não-monetários
 * (retenção IRS + créditos de fornecedor) — exactamente a mesma fórmula do
 * `computeBalance` em `src/pages/FinancialAccounts.tsx`.
 *
 * O saldo teórico da SESSÃO (entregue − aprovado − pendente) é outro conceito
 * e continua a viver em CardSessionDetail.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAccountCashAdjustments, computeAccountBalance, buildAccountCutoffs } from "@/lib/account-balance";

/** Devolve `null` quando a conta tem skip_balance_check (sem controlo de saldo). */
export async function fetchCardAccountBalance(accountId: string): Promise<number | null> {
  const [{ data: account, error: accErr }, { data: txs, error: txErr }] = await Promise.all([
    supabase
      .from("financial_accounts")
      .select("id, initial_balance, initial_balance_date, skip_balance_check")
      .eq("id", accountId)
      .maybeSingle(),
    supabase
      .from("transactions")
      .select("account_id, type, paid_amount, date, payment_date")
      .eq("account_id", accountId),
  ]);
  if (accErr) throw accErr;
  if (txErr) throw txErr;
  if (!account) return 0;

  const adjustments = await fetchAccountCashAdjustments(
    [accountId],
    buildAccountCutoffs([account as any])
  );
  return computeAccountBalance(account as any, (txs ?? []) as any, adjustments);
}
