---
name: Payment amount invariants
description: A soma de transaction_payments (planned+paid) nunca excede o bruto da transação e transactions.paid_amount nunca excede o bruto; guardas na BD (validate_installments_total + trg_validate_paid_amount_not_exceeds_gross) com exceção para legados; editor pode corrigir data/apagar pagamento
type: feature
---

# Invariantes de valor pago (2026-08)

## Regras absolutas

1. `SUM(transaction_payments.amount)` com `status IN ('planned','paid')` **nunca** excede o
   bruto da transação (`amount * (1 + iva_rate/100)`), tolerância 0,01 € — **com ou sem
   cronograma de parcelas**. Antes só validava quando havia cronograma, pelo que pagamentos
   únicos entravam sem verificação (causa dos 3 duplicados detetados em Live).
2. `transactions.paid_amount` **nunca** excede o bruto + 0,01 €.

## Guardas na base de dados

- `public.validate_installments_total()` (BEFORE INSERT/UPDATE em `transaction_payments`):
  - INSERT → recusa sempre que a soma exceda o bruto;
  - UPDATE → recusa **apenas** se a nova soma for maior que a anterior e exceder o bruto.
    Linhas legadas continuam editáveis e removíveis — só não podem piorar.
  - `v_gross <= 0` → não valida.
- `public.validate_paid_amount_not_exceeds_gross()` + trigger
  `trg_validate_paid_amount_not_exceeds_gross` (BEFORE UPDATE em `transactions`):
  recusa `paid_amount > bruto + 0,01`, exceto se `OLD.paid_amount` já excedia e
  `NEW.paid_amount <= OLD.paid_amount` (estado legado continua editável para baixo).

## Dados legados preservados por decisão do Pedro

- 3 transações com o pagamento registado 2× em `transaction_payments`.
- TX "Aluguel espaço": `paid_amount` 11.842 sobre bruto 10.086.

Não corrigir sem decisão explícita. `paid_amount` **não** é derivado de
`transaction_payments` (624 de 706 TX liquidadas não têm linhas lá e ficariam a zero).

## Frontend

- `TransactionPaymentModal` relê `transactions.paid_amount` da BD imediatamente antes de
  validar (o snapshot em memória permitia duplicar) e usa `newPaid >= amount + 0.01`.
- Todos os `insert` em `transaction_payments` (`TransactionPaymentModal`, irmãs de
  grupo-fatura, `BatchPaymentModal`) leem `{ error }` e lançam.
- `TransactionPaymentsListModal`:
  - **editor** pode alterar a **data** e **apagar** um pagamento;
  - **valor / conta / método / entidade / referência / nº fatura / nota** e o ajuste de
    pagamento direto ficam para admin/manager;
  - nenhuma ação disponível quando `eventCompleted` (evento com `status='completed'`);
  - auditoria por campo em `transaction_audit_log` mantida.
- `PaymentTimeline` abre o modal para editor (`canEditPayments`) e propaga `eventCompleted`
  (vindo de `TransactionEditModal`).

## Quem pode o quê (2026-08-31)

- **RLS `transaction_payments`** (Live, alinhada com a UI):
  - SELECT: qualquer autenticado (inalterada) · INSERT: admin, manager, editor (inalterada)
  - UPDATE / DELETE: admin, manager, **editor** (antes só admin/manager — a UI já mostrava os
    botões ao editor e o delete afetava 0 linhas **sem erro**, descasando
    `transactions.paid_amount` da soma das parcelas)
  - RESTRICTIVE `company_isolation_transaction_payments` mantida.
- **Guarda no cliente, independente da RLS**: em `TransactionPaymentsListModal` o UPDATE e o
  DELETE da linha de pagamento usam `.select("id")` e só tocam em `transactions` se voltou ≥1
  linha; 0 linhas → erro explícito e transação intacta. Um write que não escreveu nunca pode
  ser reportado como sucesso.
- **Editor**: corrige data e apaga pagamentos (evento não fechado). Valor, conta, método,
  entidade, referência, nº fatura, nota e ajuste de pagamento direto ficam admin/manager.

## paid_amount derivado (2026-09-18, #91, D-ERP86)

`transactions.paid_amount`, o estado de pagamento e `payment_date` são DERIVADOS no
servidor a partir de `transaction_payments` — o trigger
`sync_paid_amount_from_payments()` deixou de exigir cronograma de parcelas e age em
TODOS os inserts/updates/deletes de linhas. **O cliente nunca escreve `paid_amount`,
estado de pagamento ou `payment_date`**; grava/edita/apaga a LINHA e a base deriva.

Regra (só linhas `status='paid'`):
- soma ≤ 0,01 € → `paid_amount=0`, estado volta a `approved` (NÃO `pending`: é
  `approved` que os seletores das listas de pagamento exigem), `payment_date=NULL`;
- soma ≥ bruto − 0,05 € → `paid_amount=soma`, `paid`, `payment_date=max(data)`;
- entre os dois → `paid_amount=soma`, `approved` (parcial; `partially_paid` não existe).
Bruto = `amount * (1 + iva_rate/100)`; tolerância 0,05 como o `isFullyPaid` do cliente.

Moeda estrangeira: coluna `transaction_payments.closes_transaction` (bool, default
false). Em `currency <> 'EUR'` o estado passa a `paid` quando a soma atinge o bruto OU
quando a linha vem com `closes_transaction=true` (o `BatchPaymentModal` põe-na a true
quando `closesForeign`) — a variação cambial impede a igualdade em EUR.

Isenções calculadas na própria função (RETURN sem tocar na transação):
filha de rateio (`parent_transaction_id IS NOT NULL AND split_percentage IS NOT NULL`),
`is_reimbursement = true`, ou existe linha em `partner_paid_expenses`. Nestas a escrita
directa mantém-se: `settleChildrenOf` (TransactionPaymentModal), ciclo das filhas no
`BatchPaymentModal`, `PartnerPaidExpensesPanel` e notas de reembolso.

Ordem obrigatória no cliente: **linha primeiro, update dos campos não derivados depois**
(`account_id`, `payment_method`, `payment_entity`, `payment_reference`, `invoice_ref`,
limpeza de `reversed_at`/`reversal_kind`), tudo com `if (error) throw error`.

Único caso em que o cliente ainda escreve `paid_amount`: o ajuste de pagamento direto
(`PaymentTimeline`, `TransactionPaymentsListModal`), que só aparece quando NÃO há linhas —
com valor > 0 grava uma linha; com valor 0 não há linha de onde derivar, logo repõe
`paid_amount=0`, `approved`, `payment_date=NULL` directamente.

Verificação: invariante `paid_amount_sem_linhas` (error, global, referência 1 — só a
legada "Aluguel espaço" `31497cab-8123-4a5b-8ee3-0e13db8508c9`), em
`_run_invariant_checks_extra()`; prova `supabase/tests/paid_amount_derivado.sql`
(BEGIN…ROLLBACK, 4 casos, todos verdes a 18/09/2026).

## Moeda nas linhas de pagamento (2026-09-18, #127)

`transaction_payments.amount` é **sempre EUR** — é dele que `paid_amount` deriva.
A moeda de origem vive na própria linha, com a MESMA convenção de `transactions` e
`standalone_invoices`: `currency` (text NOT NULL default `'EUR'`), `original_amount`,
`fx_rate`, `fx_rate_source`. CHECK `transaction_payments_fx_required`:
`currency = 'EUR' OR (original_amount IS NOT NULL AND fx_rate IS NOT NULL)`.

Quem grava: `BatchPaymentModal` (`original_amount = item.remainingFx`, `fx_rate` =
taxa do dia se > 0 senão a da transação) e `TransactionPaymentModal`
(`original_amount = eurToOriginal(addAmount, taxa)`). `fx_rate_source` = `dia (manual)`
ou `original da transação`. A auditoria "Câmbio do dia" mantém-se.

Leitura: `PaymentTimeline` e `TransactionPaymentsListModal` mostram `CurrencyBadge`
ao lado do valor em euros quando `currency <> 'EUR'`. Nada muda em linhas EUR.

Nenhum agregado soma outra coluna que não `amount` (EUR): `PaymentTimeline`
(`totalPaid`/`totalPlanned`), `TransactionPaymentsListModal` (`totalPaid`),
`account-balance.ts` (só `withholding_amount` + `credit_amount`, ajustes de caixa).

Verificação: invariante `pagamento_moeda_sem_cambio` (error, global, referência 0)
em `_run_invariant_checks_extra()`. Backfill `backfill-127` nas 3 linhas legadas em BRL.
