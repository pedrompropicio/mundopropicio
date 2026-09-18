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
  O Extrato usa **um único critério de data** — `COALESCE(payment_date, date)` —
  na seleção do período, no corte e na ordenação (a query já não filtra por
  `date`; o período aplica-se em memória). E chama
  `fetchAccountCashAdjustments(ids, cutoffs, bounds)`: os ajustes anteriores à
  Data Início entram na abertura e os do período aparecem em **linha própria
  identificada** ("Ajustes de caixa (retenção na fonte + crédito de fornecedor)"),
  nunca escondidos dentro de outra linha. Sem isto o Saldo Final divergia do
  módulo Contas (caso real: Santander Totta, retenção de 207,00 € paga depois de
  31/08 → 284.629,07 vs 284.836,07). Datas do Excel em pt-PT.

- Implantação: modal por conta na página de Contas, **só admin**, com preview
  "sistema calcula hoje" vs "depois de implantar" antes de gravar, e registo de
  autor/hora em `system_audit_log`. O sistema nunca implanta valores.


## skip_balance_check nunca é número

Onde a conta tem `skip_balance_check`, o saldo mostra-se "não controlado"/"N/C" e
nunca zero nem negativo — ecrã e exports do Extrato, Projeção de Tesouraria
(contas ficam fora, com aviso) e `get_event_cash_position` (não as soma).
O Fluxo de Caixa é relatório de movimentos: mostra aviso de que o acumulado não é
saldo. Nas sessões de camarim o saldo mostrado é o da sessão, por desenho.

## Estorno que volta a ser pago

`reverse_transaction` com libertação põe `status='pending'` — a transação volta a
**Aguardando** e tem de ser aprovada de novo (o picker das listas exige
`approved`). Nunca escrever "volta a A pagar".
Ao liquidar de novo uma transação com `reversed_at`, a liquidação limpa
`reversed_at` e `reversal_kind` (mantém `reversal_reason` + auditoria), nos TRÊS
caminhos: modal individual, pagamento em lote e `MarkInstallmentPaidModal`
(este só escreve em `transactions` para isto — o resto é `transaction_payments`). Sem isso o custo sai do banco mas desaparece do
BP e dos agregados do sócio, que filtram `reversed_at IS NULL`.

## Repor `paid` limpa sempre o carimbo (#149, D-ERP84, 18/09/2026)

Regra única: **qualquer** caminho que faça UPDATE de uma transação EXISTENTE para
`status='paid'` tem de limpar `reversed_at = null` e `reversal_kind = null` quando
`reversed_at` está preenchido (mantendo `reversal_reason`), gravar em
`transaction_audit_log` a entrada `field_name='Estorno'` →
"Carimbo de estorno limpo — transação voltou a ser paga", e verificar `error` em
todas as escritas. Sem isto o custo sai do banco mas desaparece do BP e dos
agregados do sócio, que filtram `reversed_at IS NULL`.

Caminhos que só CRIAM transações novas já `paid` (adiantamentos, par de
transferência, geração histórica) NÃO estão abrangidos.

Auditoria 18/09/2026:

- `TransactionPaymentModal`, `BatchPaymentModal`, `MarkInstallmentPaidModal` — já conformes (molde).
- `PartnerPaidExpensesPanel` — TOCA (`addMutation` fluxo aprovado + `approveMutation`): corrigido via
  `settleExistingByPartner()`, que lê a transação, recusa se já `paid`, grava
  `paid_amount = calcTotalWithIva(amount, iva_rate)`, limpa o carimbo e audita.
  A lista de despesas disponíveis exclui `status in ('paid','reversed')`.
  NÃO cria linha em `transaction_payments` — quem paga é o sócio, não há saída de caixa da empresa.
- `TicketOfficeSettlementModal` — TOCA (confirmação do fecho põe as despesas selecionadas a `paid`;
  e os dois pagamentos parciais da fatura da sala: "venda à porta retida" e "saldo restante"):
  corrigido nos três. Os dois ramos de REVERSÃO desses pagamentos parciais podem reescrever `paid`
  ao recalcular `paid_amount`, mas nunca liquidam de novo — ficaram como estavam.
- `TicketOfficeSettlementsPanel` — TOCA ("Confirmar crédito" liquida o par da transferência): corrigido.
- `TicketOfficeAdvancesPanel` — só cria (INSERT do par de adiantamento), não abrangido.
- `TransferFormModal` — só cria (dois INSERT do par 10.3), não abrangido.
- `ImplBPTab` — não escreve em `transactions` (nenhuma referência), não abrangido.

## Fluxo de Caixa (`src/components/ReportCashFlow.tsx`)

Desde 18/09/2026 usa a fonte única: `computeAccountBalance` + `buildAccountCutoffs`
+ `countsAfterCutoff` + `effectivePaymentDate` + `fetchAccountCashAdjustments`.
Lê só `status='paid'` com `reversed_at IS NULL` e sem limite inferior de data (o
histórico anterior faz o Saldo de abertura), pagina com `fetchAllPaged`, exclui as
filhas de rateio (D-ERP70) e deixa as contas `skip_balance_check` fora do saldo,
listadas em nota. Mostra "Saldo de abertura", "Ajustes de caixa (retenção na fonte
+ crédito de fornecedor)" em linha própria e "Saldo acumulado". O aviso de que "o
acumulado não é saldo" desapareceu. O relatório não tem export.
