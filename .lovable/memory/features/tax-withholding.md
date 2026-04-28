---
name: tax-withholding
description: Retenção IRS — declarada no lançamento (taxa/valor da fatura) e confirmada/ajustada no pagamento; declarada não altera amount nem balanço, só pré-preenche
type: feature
---

# Retenção IRS (despesas)

A retenção IRS pode ser registada em dois momentos:

## 1. No **lançamento** (declarada na fatura)
- Campos novos em `transactions`: `declared_withholding_rate` (numeric, %) e `declared_withholding_amount` (numeric, €). Ambos opcionais e aceitam ≥ 0.
- UI: componente `WithholdingDeclaredFields` (rate ou valor — recalcula o outro automaticamente a partir da `amount`).
- Disponível em `TransactionFormModal` (criação) e `TransactionEditModal` (edição), apenas para `type='expense'`.
- Em transações com **split**, o valor declarado é guardado integral no parent e proporcional a cada filho (×split_percentage).
- **Não altera** `amount` (que continua a ser a base da fatura) nem o saldo da conta — é puramente metadata declarativa.

## 2. No **pagamento** (efetiva)
- `transaction_payments.withholding_amount` continua a ser o registo final por parcela.
- O `TransactionPaymentModal` pré-preenche o input "Retenção IRS (€)" com `declared_withholding_amount` e mostra badge "Pré-preenchido da fatura (X%)". O utilizador pode ajustar.
- Validações de pagamento (saída de caixa, balanço) usam o valor efetivo no input, não o declarado.

## Caches de artistas
Para caches o sistema continua a criar **automaticamente** uma transação de retenção via `CacheTransactionModal` quando `withholding_applicable=true` na config — esse fluxo já cobre o "lançar a retenção no ato".

## Edge function `update-transaction`
- `declared_withholding_rate` e `declared_withholding_amount` estão em `allowedFields` e em `paidAllowedFields` (podem ser corrigidos mesmo após pago, porque são metadata fiscal, não movem dinheiro).

## Migração
- `20260428122736_*.sql`: adiciona as duas colunas + constraint `transactions_declared_withholding_nonneg` (não negativos).
