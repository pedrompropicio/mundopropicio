---
name: BP vs Real expandable & 1-tx-per-line rule
description: Vista "Previsão vs Real" expansível por grupo L2 + linha L3 com transações; bulk "Gerar Transações" só aceita 1 tx auto por linha BP; regras estritas de filtragem (BP approved, TX approved/paid, sem transitórias/exclude_from_result, overhead só no Master, simetria Master↔Real)
type: feature
---
- Aba **Previsão vs Real** (EventForecast → ComparisonTable) é expansível: chevron por **grupo L2** mostra/oculta categorias L3; chevron por **linha L3** lista as transações reais da categoria (data, descrição, base, c/IVA, badge Pago/A pagar). Estados independentes (`expandedGroups`, `expandedRows`).
- Helper puro `findMatchingTransactionsForForecast(forecast, transactions, allForecasts)` reutiliza a mesma lógica de matching da `ComparisonRowItem` (direct `transaction_id` → mesma categoria com 1 forecast → token-based winner-takes-all).
- **Regra "1 TX auto por linha BP"**: `isEligibleForBulkTx(f) = approved && !transaction_id && matching.length === 0`. O botão **Gerar Transações** (despesas e receitas) e o `handleBulkCreateTx` usam esse filtro. Linhas que já têm tx ficam fora; toast informa quantas foram puladas e instrui criar adicionais pelo modal de Transações.

## Regras de filtragem em `comparisonForecasts` / `comparisonTransactions` (decisão Mágicos, 2026-04)

Antes de chamar `buildComparison`, o `EventForecast.tsx` filtra dois arrays para garantir que **Previsto** e **Real** representam o mesmo perímetro e excluem ruído:

### Previsto (`comparisonForecasts`)
- Apenas `status === "approved"` (rascunhos e rejeitadas não contam para variação real).
- Exclui `exclude_from_result = true` e `is_transitory = true`.
- Exclui linhas com `_overhead_via_master` (overhead só vive no Master nesta vista).
- **Master sem toggle Master+Subs**: exclui forecasts cujo `event_id !== eventId` (não vaza linhas de subs).

### Real (`comparisonTransactions`)
- Apenas `status in ("approved","paid")` (pendentes não inflam o Real).
- Exclui `is_transitory` e `exclude_from_result`.
- **Master sem toggle Master+Subs**: ignora TX de filhos (`t.event_id && t.event_id !== eventId`). Multi-event masters (`event_id === null`) continuam a aparecer.

### Por que estas regras
No projecto Mágicos a vista estava confusa porque:
1. Real incluía pendentes e transitórias (cauções) → totais inflados.
2. Master mostrava TX dos subs no Real mas Previsto só era do Master se toggle OFF → assimetria visual.
3. Overhead Master rateado aparecia também no Sub via `_overhead_via_master`, fazendo dupla contagem visual.

A vista agora é **estrita e simétrica**: o que se vê no Previsto e no Real cobre o mesmo conjunto de eventos e o mesmo critério de "real económico aprovado".
