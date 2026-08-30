---
name: Conta e registo de pagamento — só na transação-mãe
description: Só a transação-mãe carrega account_id e linha em transaction_payments; filhas de rateio nunca. "Marcar como Pago" na Lista de Contas a Pagar é estritamente visual; a liquidação real é o BatchPaymentModal com conta obrigatória
type: feature
---

# Titularidade da conta e do registo de pagamento (2026-08)

## Regras absolutas

1. **A saída de dinheiro pertence à transação-mãe.** Só ela recebe `account_id` e só ela
   gera linha em `transaction_payments`.
2. **Filhas de rateio (`parent_transaction_id`) nunca** recebem `account_id` nem linha em
   `transaction_payments`. Recebem apenas `paid_amount`, `status` e `payment_date`, para
   efeitos analíticos. Se recebessem conta ou linha de pagamento, a saída contaria **duas
   vezes** no saldo da conta e na tesouraria.
   - Invariante verificada em Live (30/08/2026): nenhuma filha tem conta ao mesmo tempo
     que o pai. Manter.
   - Aplicado em `BatchPaymentModal` (propagação às filhas sem `account_id`).
3. **Nenhuma liquidação sem conta.** Qualquer caminho que ponha `status='paid'` tem de
   passar por um modal de pagamento que exija `account_id` e crie a linha em
   `transaction_payments`.

## Lista de Contas a Pagar (`PaymentListsTab`)

- **"Marcar como Pago" (por item) é estritamente visual.** Grava apenas
  `payment_list_items.manually_marked_paid` (toggle). **Não** escreve `paid_amount`,
  `status` nem `payment_date` na transação. Serve de guia para o Pedro não pagar duas
  vezes quando faz a transferência manualmente no banco.
  - Regressão corrigida em 30/08/2026: o botão passou a liquidar a transação sem conta e
    sem registo de pagamento (218 transações afetadas).
- **"Liquidar (N)"** delega no `BatchPaymentModal` (o mesmo do ecrã de Transações):
  conta financeira obrigatória escolhida uma vez para o lote, validação de saldo,
  retenções, câmbio e uma linha em `transaction_payments` por transação. A data sugerida
  por defeito é `payment_lists.payment_date` (prop `initialPaymentDate`).
  - Já não existe escrita direta a `transactions` neste ecrã.

## Dados legados

526 transações liquidadas em Live (1.247.597 €) sem `account_id` e sem
`transaction_payments`, resultantes destes caminhos. **Sem backfill** — decisão separada
do Pedro. Não corrigir sem instrução explícita.
