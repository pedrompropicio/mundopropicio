---
name: Transaction Reversal (Estorno de Transação)
description: Estorno ao nível da TRANSAÇÃO inteira — marca como Estornada (status='reversed'), sem voltar a "A Pagar". Complementa o estorno por parcela e o "Desfazer liquidação"
type: feature
---

# Estorno de Transação

Operação **ao nível da transação inteira**, distinta de:
- **Estorno de parcela** (`reverse_payment` em `transaction_payments`) — só uma parcela individual.
- **Desfazer liquidação** — corrige liquidações marcadas por engano, devolvendo a TX a `approved`.

Usado quando o pagamento foi efectivamente feito mas é devolvido/duplicado.

## Status novo: `reversed`

- `transactions.status` aceita `'reversed'` (constraint actualizada).
- UI: badge laranja **"Estornada"** (`bg-orange-500/15 text-orange-500`).
- Filtros em `Transactions.tsx`:
  - **Em aberto**: exclui `status='reversed'` (não está pendente).
  - **Liquidadas**: inclui `status='reversed'` (mostra com badge para histórico).

## Duas variantes

### V1 — `cash_refund` (devolução em dinheiro)
- TX → `status='reversed'`, **`paid_amount=0`**, `payment_date=NULL`.
- Parcelas pagas em `transaction_payments` → `status='reversed' + reversal_kind='cash_refund'`.
- Remove de `payment_list_items` quando a lista está em `draft`/`pending_approval`.
- **Saldo da conta sobe** (paid_amount foi a zero).

### V2 — `supplier_credit`
- TX → `status='reversed'`, **`paid_amount` mantém-se** (o dinheiro saiu mesmo).
- Cria `supplier_credits` (amount = paid_amount, document_ref=`reverse_tx:<id>`).
- Parcelas pagas → `reversal_kind='supplier_credit'` (status fica `paid` para não baralhar trigger de paid_amount).
- TX ganha `supplier_credit_id` para back-reference.
- **Saldo da conta não muda**.
- Exige `supplier_id` na TX.

## Schema

```sql
ALTER TABLE public.transactions
  ADD COLUMN reversal_kind text CHECK (NULL OR IN ('cash_refund','supplier_credit')),
  ADD COLUMN reversal_reason text,
  ADD COLUMN reversed_at timestamptz,
  ADD COLUMN reversed_by uuid,
  ADD COLUMN supplier_credit_id uuid REFERENCES supplier_credits(id);
-- status_check passa a incluir 'reversed'
```

## RPC

`public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date default null)` — `SECURITY DEFINER`, só admin, atómica. Audit em `system_audit_log` (`action='reverse_transaction_<kind>'`).

## UI

- `src/components/ReverseTransactionDialog.tsx` — diálogo (preset motivo + V1/V2 + validade opcional).
- `src/components/PaymentTimeline.tsx` — botão laranja **"↩ Estornar"** (admin, TX com pagamento, não estornada). Separado do "Desfazer liquidação" (vermelho).
- Banner laranja "Transação Estornada" no topo do timeline quando `status='reversed'` (com motivo, kind e data).

## Não confundir com

- **Desfazer liquidação** (`undoSettlementMutation`) — mantém-se como acção separada para "marquei pago por engano". Volta a TX a `approved`.
- **Eliminar transação** (`deleteTransactionCascade`) — para erros onde a TX nunca devia ter existido.
