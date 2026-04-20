---
name: BP vs Real expandable & 1-tx-per-line rule
description: Vista "Previsão vs Real" expansível por grupo L2 + linha L3 com transações; bulk "Gerar Transações" só aceita 1 tx auto por linha BP (transaction_id ou matching de descrição) — adicionais via modal de Transações
type: feature
---
- Aba **Previsão vs Real** (EventForecast → ComparisonTable) é expansível: chevron por **grupo L2** mostra/oculta categorias L3; chevron por **linha L3** lista as transações reais da categoria (data, descrição, base, c/IVA, badge Pago/A pagar). Estados independentes (`expandedGroups`, `expandedRows`).
- Helper puro `findMatchingTransactionsForForecast(forecast, transactions, allForecasts)` reutiliza a mesma lógica de matching da `ComparisonRowItem` (direct `transaction_id` → mesma categoria com 1 forecast → token-based winner-takes-all).
- **Regra "1 TX auto por linha BP"**: `isEligibleForBulkTx(f) = approved && !transaction_id && matching.length === 0`. O botão **Gerar Transações** (despesas e receitas) e o `handleBulkCreateTx` usam esse filtro. Linhas que já têm tx ficam fora; toast informa quantas foram puladas e instrui criar adicionais pelo modal de Transações.
