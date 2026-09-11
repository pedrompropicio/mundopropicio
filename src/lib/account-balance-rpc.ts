/**
 * Travas de saldo pelo servidor (D-ERP34).
 *
 * O saldo calculado no cliente soma só as transações que o utilizador consegue
 * LER. Desde o guard `transactions_confidential_guard`, as saídas confidenciais
 * ficam invisíveis para quem não tem `view_confidential` — o saldo calculado
 * fica ACIMA do real e a trava deixava passar pagamentos que descobrem a conta.
 *
 * Por isso:
 *   - a DECISÃO passa por `account_has_balance_for` (SECURITY DEFINER, vê tudo,
 *     devolve só boolean — nunca o valor do saldo);
 *   - a EXIBIÇÃO passa por `account_true_balance`, que devolve NULL a quem não
 *     pode ver o saldo. Nesse caso não se mostra nada: nem zero, nem traço.
 *
 * Ambas replicam exatamente a fórmula canónica de `computeAccountBalance`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Decisão da trava: true = há saldo (ou a conta não tem controlo de saldo). */
export async function accountHasBalanceFor(accountId: string, amount: number): Promise<boolean> {
  const { data, error } = await supabase.rpc("account_has_balance_for" as any, {
    _account_id: accountId,
    _amount: amount,
  });
  if (error) throw error;
  return data === true;
}

/** Saldo verdadeiro da conta; NULL quando o utilizador não o pode ver. */
export async function fetchAccountTrueBalance(accountId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc("account_true_balance" as any, {
    _account_id: accountId,
  });
  if (error) throw error;
  return data === null || data === undefined ? null : Number(data);
}

/**
 * Saldo verdadeiro da conta selecionada, para exibição.
 * `undefined` = ainda a carregar; `null` = sem autorização para ver.
 */
export function useAccountTrueBalance(accountId?: string | null) {
  const { data } = useQuery({
    queryKey: ["account-true-balance", accountId],
    enabled: !!accountId,
    queryFn: () => fetchAccountTrueBalance(accountId as string),
  });
  return accountId ? data : undefined;
}

/** Mensagem de saldo insuficiente: só revela o valor a quem pode vê-lo. */
export function insufficientBalanceMessage(
  visibleBalance: number | null | undefined,
  format: (v: number) => string
): string {
  if (visibleBalance === null || visibleBalance === undefined) {
    return "Saldo insuficiente na conta.";
  }
  return `Saldo insuficiente na conta. Disponível: ${format(visibleBalance)}`;
}
