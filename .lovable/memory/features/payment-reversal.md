---
name: Payment Reversal (Estorno)
description: Estorno de pagamentos em 2 variantes — devolução em dinheiro (V1) e conversão em crédito do fornecedor (V2)
type: feature
---

# Estorno de Pagamento

Funcionalidade para reverter pagamentos feitos indevidamente. **Substitui o uso de "Eliminar transação"** para erros operacionais — a transação é preservada para histórico/auditoria.

## Duas variantes

### V1 — Devolução em dinheiro (`cash_refund`)
- O fornecedor devolveu o dinheiro à conta bancária.
- Parcela em `transaction_payments` passa a `status='reversed'` + `reversal_kind='cash_refund'`.
- Trigger `sync_paid_amount_from_payments` recalcula `paid_amount` e `status` da transação automaticamente (a parcela deixa de contar como paga).
- Para TXs sem cronograma de parcelas, a RPC recalcula manualmente.
- **Saldo da conta SOBE** automaticamente (a parcela deixa de aparecer como saída).
- Itens em `payment_list_items` ligados a listas `draft` ou `pending_approval` são removidos. Listas já fechadas mantêm o histórico.
- BP: o forecast volta a ficar "não pago" porque a TX volta a `approved`/`partially_paid`/`pending`.

### V2 — Conversão em crédito do fornecedor (`supplier_credit`)
- O dinheiro **saiu mesmo** da conta — não volta. Fica como haver no fornecedor.
- Parcela **mantém `status='paid'`** (decisão técnica: o trigger de `paid_amount` filtra por `status='paid'`; alterar status quebraria `paid_amount`). Marca-se com `reversal_kind='supplier_credit'`, `reversal_reason`, `reversed_at`, `reversed_by`, `supplier_credit_id`.
- Cria registo em `supplier_credits` (amount = valor da parcela, supplier = supplier da TX, origin_event_id = evento da TX, validade opcional).
- **Saldo da conta NÃO muda** — correto, o dinheiro saiu.
- Transação continua paga; BP fica liquidado como antes.
- Badge "↻ Crédito fornecedor" na parcela.

## Efeito no saldo (computeBalance)

- `transactions.paid_amount` é a fonte primária. O trigger filtra `status='paid'`, logo:
  - V1 → parcela sai → `paid_amount` desce → saldo sobe.
  - V2 → parcela mantém-se `paid` → `paid_amount` inalterado → saldo inalterado.
- `fetchAccountCashAdjustments` (`src/lib/account-balance.ts`) soma `withholding_amount + credit_amount` por conta para reinjectar no saldo. **Filtra `status != 'reversed'`** para que parcelas V1 não continuem a inflacionar o saldo via withholding/credit residuais.

## Permissões

- Só `admin` chama a RPC `reverse_payment` (verificação dentro da função + UI esconde botão).
- Editor/manager continuam sem acesso.

## Schema

```sql
ALTER TABLE transaction_payments
  ADD COLUMN reversal_kind text CHECK (NULL OR IN ('cash_refund','supplier_credit')),
  ADD COLUMN reversal_reason text,
  ADD COLUMN reversed_at timestamptz,
  ADD COLUMN reversed_by uuid,
  ADD COLUMN supplier_credit_id uuid REFERENCES supplier_credits(id);

ALTER TABLE transaction_payments
  DROP CONSTRAINT transaction_payments_status_check,
  ADD CONSTRAINT transaction_payments_status_check
    CHECK (status IN ('planned','paid','cancelled','reversed'));
```

## RPC

`public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date default null)` — `SECURITY DEFINER`, só admin, atómica. Audit log em `system_audit_log` (`action = reverse_payment_<kind>`).

## UI

- `src/components/ReversePaymentDialog.tsx` — diálogo com motivo (preset + texto), radio V1/V2, validade opcional na V2.
- `src/components/PaymentTimeline.tsx` — botão "↩ Estornar" em cada parcela paga (admin); secção própria para parcelas estornadas V1; badge "↻ Crédito fornecedor" para V2.

## Uso do crédito (não alterado)

O fluxo de aplicar crédito existente num pagamento novo já está em `TransactionPaymentModal.tsx` (`availableCredits`, `creditAllocations`, `supplier_credit_usages`). Pagamentos a fornecedores com crédito ativo mostram automaticamente a opção de abater.

## Não confundir com

- **Eliminar transação** (`deleteTransactionCascade`) — continua para erros de digitação onde a TX nunca devia ter existido. Vai para Trash 30d.
- **Reembolsos** (`reimbursement_notes`) — fluxo inverso: empresa paga colaborador por despesas adiantadas.
