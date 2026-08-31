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
