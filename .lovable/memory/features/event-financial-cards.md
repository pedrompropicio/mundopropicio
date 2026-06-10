---
name: Event Financial Cards (3 modes)
description: Cards Receitas/Custos no EventDetail com 3 modos (Realizado/Comprometido/Forecast), mini-barra de formalidade e integração com Simulador
type: feature
---

# Event Financial Cards — Receitas & Custos no EventDetail

## Visão geral
Substitui os 2 StatCards estáticos por `<EventFinancialCard>` com 3 modos comutáveis via dropdown ⚙️. O card `Lucro` reage via `onValueChange`.

## 3 modos
- **Realizado** — TXs do(s) evento(s) seleccionado(s) (paid/approved, não transitórias). Receitas com replace por `ticketSalesRevenue` (1.1.01). Custos: `Pago / Aprovado / [Cachê] / Total`.
- **Comprometido** — Σ `event_forecasts.amount` (active version, approved, !is_transitory, !exclude_from_result). Mini-barra de formalidade (Estimado/Negociação/Fechado/Pago) com tooltips. Cachê aparece em legenda quando >0.
- **Forecast**
  - Receitas: `computeScenarioRevenue` (toggle today/breakeven/forecast). Sub-totais Bilheteira/Patrocínio/A&B/Outros/Total.
  - Custos: formalidade-aware. Linhas com `formalidade ∈ {fechado, pago_parcial, pago_total}` que tenham TX na mesma `category_id+event_id` usam Σ TX; restantes usam BP. TX em categorias sem linha BP somam à parte (são TXs reais do sub, não "órfãs"). Sub-totais: `BP do sub / TX do sub / [Cachê] / Total`.

## Master/Split — modelo respeitado
Fonte de verdade: `master-split-rateio-source-of-truth.md`.

Despesa partilhada do Master vive em 3 peças:
1. `event_forecasts.event_id = Master` (previsão)
2. `transactions.event_id = NULL` flutuante (pagamento, ligada via `forecast.transaction_id`)
3. `transactions.event_id = SUB, parent_transaction_id`, `amount÷N` (TX-filha já no sub)

**O card do sub selecciona TX por `event_id=sub` — as TX-filhas (peça 3) ENTRAM NATURALMENTE.** Não existe rateio virtual de BP comum Master→sub. Não somar quotas adicionais — duplicaria.

### Única expansão virtual: overhead
`is_overhead=true` é expandido por `expandOverheadToSplits` / `bp_overhead_via_master` (÷ N siblings) nas superfícies DRE, BP, Acerto Sócios, Análise Resultados. O card NÃO duplica isto — o toggle "Com/Sem Overhead" no EventForecast/relatórios já controla a visibilidade.

### Histórico — porque foram removidos `masterExpenseShare` e `masterForecastShare`
Versões anteriores deste hook recebiam `masterExpenseShare` (Σ TX `event_id=Master` ÷ N) e `masterForecastShare` (overhead Master ÷ N). Ambos eram **dupla contagem**:
- TXs do split real têm `event_id=NULL` (flutuante) ou `event_id=sub` (filha) — somar TX por `event_id=Master ÷ N` duplicava com as filhas que já vivem no sub.
- `masterForecastShare` somava overhead já mostrado pelo EventForecast (badge "via Master") e duplicava o que DRE/Acerto já faz via `expandOverheadToSplits`.

Removidos em 2026-06. Único extra externo legítimo: `cacheImpact` (vem de `useEventCacheImpact`, vive fora de `event_forecasts`/`transactions`).

## Cachê
`cacheImpact` (calculado por `useEventCacheImpact`) é somado em todos os modos quando >0. Em committed aparece em legenda abaixo da mini-barra; em realized/forecast como sub-total `Cachê` antes do `Total`.

## Sub-totais — ordem
`Total` é SEMPRE a última linha quando presente.

## localStorage
Chave: `ef-card-mode-{user_id}-{event_id}-{kind}` — guarda só a string de modo, nunca valores monetários.

## Ficheiros
- `src/lib/event-financial-card.ts` — helpers puros
- `src/hooks/useEventFinancialCardData.ts` — fetch + cálculo
- `src/components/EventFinancialCard.tsx` — UI
- `src/pages/EventDetail.tsx` — integração
