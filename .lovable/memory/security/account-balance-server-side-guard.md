---
name: Travas de saldo pelo servidor
description: account_has_balance_for (boolean) decide pagamentos/transferências; account_true_balance (numeric ou NULL) é a única fonte do saldo mostrado nesses formulários
type: feature
---

Com o guard `transactions_confidential_guard`, as saídas confidenciais ficam
invisíveis para quem não tem `view_confidential`; o saldo calculado no cliente
ficava ACIMA do real e a trava deixava passar pagamentos que descobriam a conta.

- `public.account_has_balance_for(_account_id, _amount) → boolean`
  SECURITY DEFINER. Vê TODAS as transações. `true` se `skip_balance_check`, ou se
  `_amount <= saldo verdadeiro`. **Nunca devolve o valor do saldo.**
- `public.account_true_balance(_account_id) → numeric`
  SECURITY DEFINER. Devolve valor só a platform_admin, role `admin`, ou
  `view_balances` + `balance_visible_to_all = true`; caso contrário NULL
  (também NULL em contas `skip_balance_check`).
- Fórmula interna (`_account_true_balance_raw`, privada) é o espelho exacto de
  `computeAccountBalance`: `initial_balance` + Σ `paid_amount` (income soma, resto
  subtrai, sem filtro de status/reversed/hidden) + Σ (`withholding_amount` +
  `credit_amount`) de `transaction_payments`, tudo com corte em
  `initial_balance_date` sobre `COALESCE(payment_date, date)`.
  Validado a 2026-09-11: Banco Santander Totta = 427.484,62 € nas duas vias.

Consumidores (via `src/lib/account-balance-rpc.ts`): `TransactionPaymentModal`,
`TransferFormModal`, `BatchPaymentModal`. Nestes três, quando o saldo vem NULL
**não se mostra nada** (nem zero, nem traço) e a mensagem de erro é apenas
"Saldo insuficiente na conta.".

Fora deste âmbito e ainda a calcular saldo no cliente: lista de Contas, cartões,
bilheteiras e relatórios (segunda ronda).

## Contas restritas → confidencial garantido na base

Trigger `trg_force_confidential_restricted_account` (BEFORE INSERT OR UPDATE em
`transactions`, função `public.force_confidential_for_restricted_account()`):
se `account_id` aponta para conta com `is_restricted = true`, força
`is_confidential = true`. Só liga o flag, nunca o desliga.

Frontend (redundante, mas mantido): `TransferFormModal` e `BankLineLaunchModal`
trazem `is_restricted` nas contas e marcam as DUAS pernas do par como
confidenciais se origem OU destino for restrita; a caixa "Confidencial" só
adiciona, nunca remove.
