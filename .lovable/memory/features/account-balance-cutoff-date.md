---
name: Account balance cutoff date
description: financial_accounts.initial_balance_date define o corte do saldo inicial; skip_balance_check nunca vira número; estorno repago limpa reversed_at
type: feature
---

# Data de corte do saldo inicial (D-ERP25, 09/09/2026)

- `financial_accounts.initial_balance_date` (date, nullable): `initial_balance` é o saldo
  ao **fecho** desse dia. Movimentos com data efetiva `COALESCE(payment_date, date)`
  **igual ou anterior** ao corte já estão dentro do valor e não somam outra vez.
  `NULL` = comportamento antigo (saldo inicial sem tempo, soma-se a tudo).
- A regra vive na fonte única `computeAccountBalance` (`src/lib/account-balance.ts`,
  D-ERP12) e nos ajustes `fetchAccountCashAdjustments(accountIds?, cutoffs?)`.
  Helpers: `effectivePaymentDate`, `countsAfterCutoff`, `buildAccountCutoffs`.
- Propagada a: módulo Contas, `TransactionPaymentModal`, `BatchPaymentModal`,
  `TransferFormModal`, `card-account-balance.ts`, `card-session-balance.ts`,
  `CardSessions.tsx` (usa a fonte única — o cálculo inline antigo era o saldo
  CONTABILÍSTICO da conta do cartão, não o da sessão), Extrato e
  `get_event_cash_position` / `get_event_cash_position_invariant` (os dois lados
  filtram `skip_balance_check` e o corte; sem isso `is_balanced` era falso por
  construção).
- Extrato: o corte vale na abertura **e em todas as linhas** (o anterior ao corte
  já está no `initial_balance`), a abertura funciona sem Data Início, as linhas
  usam `paid_amount` (não `amount`) e o cabeçalho mostra
  "Saldo implantado a <data>: <valor>" no ecrã, no Excel e no PDF.
- Implantação: modal por conta na página de Contas, **só admin**, com preview
  "sistema calcula hoje" vs "depois de implantar" antes de gravar, e registo de
  autor/hora em `system_audit_log`. O sistema nunca implanta valores.


## skip_balance_check nunca é número

Onde a conta tem `skip_balance_check`, o saldo mostra-se "não controlado"/"N/C" e
nunca zero nem negativo — ecrã e exports do Extrato, Projeção de Tesouraria
(contas ficam fora, com aviso) e `get_event_cash_position` (não as soma).
O Fluxo de Caixa é relatório de movimentos: mostra aviso de que o acumulado não é
saldo. Nas sessões de cartão/camarim o saldo mostrado é o da sessão, por desenho.

## Estorno que volta a ser pago

`reverse_transaction` com libertação põe `status='pending'` — a transação volta a
**Aguardando** e tem de ser aprovada de novo (o picker das listas exige
`approved`). Nunca escrever "volta a A pagar".
Ao liquidar de novo uma transação com `reversed_at`, a liquidação limpa
`reversed_at` e `reversal_kind` (mantém `reversal_reason` + auditoria), no modal
individual e no pagamento em lote. Sem isso o custo sai do banco mas desaparece do
BP e dos agregados do sócio, que filtram `reversed_at IS NULL`.
