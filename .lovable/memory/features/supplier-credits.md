---
name: Supplier credits
description: Ciclo completo dos créditos de fornecedor — nascimento por estorno total/parcial ou avulso, gestão em Fornecedores, abate transacional no pagamento e semântica de DRE
type: feature
---

# Créditos de Fornecedor (issue #40)

## Semântica de DRE (decidida)
O custo fica **SEMPRE no evento de origem**. Criar ou usar um crédito **não gera
nenhum movimento de DRE/BP**. O crédito apenas **reduz a saída de caixa** quando
é abatido num pagamento (`transaction_payments.credit_amount`, compensado nos
saldos por `src/lib/account-balance.ts`).

## Nascimento do crédito

1. **Estorno de pagamento (total ou parcial)** — RPC `reverse_payment(p_payment_id,
   p_kind, p_reason, p_valid_until, p_amount)`.
   - `p_kind='supplier_credit'` cria o `supplier_credits`.
   - `p_amount` NULL = crédito pelo valor total do pagamento; com valor exige
     `0 < p_amount <= payment.amount` (caso típico: fatura paga renegociada →
     crédito só da diferença).
   - Guard contra **duplo estorno**: se `reversal_kind` já está preenchido no
     pagamento, a RPC levanta exceção.
   - UI: `src/components/PaymentTimeline.tsx`, botão "Estornar" por parcela paga →
     escolha "Crédito no fornecedor" / "Reembolso em caixa" + campo "Valor do
     crédito" pré-preenchido com o total, editável para menos.
2. **Crédito avulso** — `NewSupplierCreditModal` (ex.: diárias de hotel pagas e não
   usadas, com nota de crédito emitida sem estorno na plataforma). INSERT direto
   em `supplier_credits` com `used_amount=0`, `status='active'`. Campos: fornecedor*,
   valor*, motivo*, evento de origem, validade, `document_ref` (nº da nota),
   anexo (`file_url`, bucket privado isolado `supplier-credit-documents`).
   Permissão: admin/manager.

## Gestão
- **Aba "Créditos"** em `/fornecedores` (`SupplierCreditsTab`): agrupada por
  fornecedor, com saldo disponível (`amount − used_amount`), estado
  (ativo/esgotado/expirado), validade, motivo, link do anexo (signed URL 1h) e
  expansão com histórico de usos (`supplier_credit_usages` → transação/fatura).
  Botão "Novo crédito".
- **Card resumo** `SupplierCreditsSummaryCard` na página de Contas: "Créditos de
  fornecedor ativos — total X € em N fornecedores", clicável para `/fornecedores`.

## Abate no pagamento (sugestão + confirmação)
- `SupplierCreditBanner` aparece nos fluxos de liquidação quando a transação tem
  `supplier_id` com crédito utilizável: "💳 Este fornecedor tem X € de crédito
  disponível", seletor do crédito + valor (default `min(saldo, valor a pagar)`,
  editável). **Nunca abate sem confirmação explícita.**
- Abate via RPC transacional `apply_supplier_credit(p_credit_id, p_transaction_id,
  p_amount, p_payment_id)`: `SELECT ... FOR UPDATE` no crédito, valida saldo e
  validade, INSERT em `supplier_credit_usages`, UPDATE `used_amount`
  (`status='exhausted'` ao esgotar) e preenche `credit_amount` no pagamento. Tudo ou nada.
- Créditos com `valid_until` vencida não aparecem para uso; `expire_supplier_credits()`
  (chamada no load via `expireStaleCredits`) marca `status='expired'`.

## Ficheiros
- `src/lib/supplier-credits.ts` — helpers (`creditRemaining`, `isCreditUsable`,
  `fetchAvailableCredits`, `applySupplierCredit`, `expireStaleCredits`).
- `src/hooks/useAvailableSupplierCredits.ts`
- `src/components/supplier-credits/{SupplierCreditBanner,NewSupplierCreditModal,ApplySupplierCreditDialog,SupplierCreditsTab,SupplierCreditsSummaryCard}.tsx`
- Integrações: `MarkInstallmentPaidModal`, `PaymentTimeline`, `Suppliers`, `FinancialAccounts`.
