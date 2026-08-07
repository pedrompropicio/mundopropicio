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
import { fetchAccountCashAdjustments } from "@/lib/account-balance";

export async function fetchCardAccountBalance(accountId: string): Promise<number> {
  const [{ data: account, error: accErr }, { data: txs, error: txErr }, adjustments] = await Promise.all([
    supabase.from("financial_accounts").select("initial_balance").eq("id", accountId).maybeSingle(),
    supabase.from("transactions").select("type, paid_amount").eq("account_id", accountId),
    fetchAccountCashAdjustments([accountId]),
  ]);
  if (accErr) throw accErr;
  if (txErr) throw txErr;

  let balance = Number(account?.initial_balance ?? 0);
  for (const t of txs ?? []) {
    const amt = Number((t as any).paid_amount ?? 0);
    balance += (t as any).type === "income" ? amt : -amt;
  }
  balance += adjustments.get(accountId) ?? 0;
  return balance;
}
