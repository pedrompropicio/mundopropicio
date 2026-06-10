---
name: Event Financial Cards (3 modes)
description: Cards Receitas/Custos no EventDetail com 3 modos (Realizado/Comprometido/Forecast), mini-barra de formalidade, apropriação BP Master para apuração de resultado (forecast) e integração com Simulador
type: feature
---

# Event Financial Cards — Receitas & Custos no EventDetail

## Visão geral
Substitui os 2 StatCards estáticos por `<EventFinancialCard>` com 3 modos comutáveis via dropdown ⚙️. O card `Lucro` reage via `onValueChange`.

## 3 modos
- **Realizado** — TXs do(s) evento(s) seleccionado(s) (paid/approved, não transitórias). Receitas com replace por `ticketSalesRevenue` (1.1.01). Custos: `Pago / Aprovado / [Cachê] / Total`.
- **Comprometido** — Σ `event_forecasts.amount` (active version, approved, !is_transitory, !exclude_from_result). Mini-barra de formalidade (Estimado/Negociação/Fechado/Pago) com tooltips. Cachê aparece em legenda quando >0.
- **Forecast** — APURAÇÃO DE RESULTADO (ver secção seguinte).

## Forecast — apropriação BP Master (regra 1-7)

Os cards Forecast são cards de análise de resultado: custos partilhados que vivem no BP do Master TÊM de ser apropriados (rateados) nos subs, mesmo não pagos. Distinto do rateio financeiro (overhead/expandOverheadToSplits) — esta apropriação é só visual no card, não cria forecasts virtuais.

Regras (validadas com Simone Mendes 2026 em Live):

1. **Rateio BP Master ÷ N subs** — N = count `events.parent_event_id = master`.
2. **Por categoria** do BP Master que NÃO existe no BP do sub:
   `quota = MAX(previsto_master[cat] ÷ N, Σ TX-filhas no sub nessa cat)`
3. **Só modo Forecast** — Realized/Committed inalterados.
4. **Receita Master (patrocínio) rateia igual** — adicionado como sub-total `Patrocínio (rateio Master)`.
5. **TX local exclusiva** (TX_LOCAL_PURA ou PARCELA_LOCAL) em cat NÃO coberta pelo BP do sub soma POR CIMA, mesmo que a cat tenha quota Master.
6. **Anti-duplicação** — TX-filha conta UMA vez (dentro do MAX). Visão Global (parentEventId=null) não aplica quota.
7. **Critério estrito de TX-filha de rateio Master**:
   ```
   parent_transaction_id NOT NULL
   AND (parent.event_id IS NULL OR parent.event_id != child.event_id)
   ```
   Parcela local (parent.event_id = child.event_id) NÃO é filha de rateio Master — é TX local.

### Helper
`src/lib/master-forecast-allocation.ts` — função pura `computeMasterForecastAllocation` com testes (`src/lib/__tests__/master-forecast-allocation.test.ts`) que validam os números Simone:
- Lisboa: rateioMaster=32.735,65, txLocal=608,26
- Aéreo: quota=MAX(22.000, 11.670)=22.000 (filhas não duplicam)
- Hospedagem (overlap com BP sub): NÃO rateia nem entra em txLocal
- Digital: quota Master 6.000 + TX local 608 somam separadamente

### Sub-totais Forecast Custos
`BP do sub / [Rateio Master (previsto)] / [TX local] / [Cachê] / Total`
(linhas a 0 omitidas; Total sempre por último).

### Sub-totais Forecast Receitas
`Bilheteira / Patrocínio / A&B / Outros / [Patrocínio (rateio Master)] / Total`

## Master/Split — modelo respeitado
Fonte de verdade: `master-split-rateio-source-of-truth.md`.

Despesa partilhada do Master vive em 3 peças:
1. `event_forecasts.event_id = Master` (previsão)
2. `transactions.event_id = NULL` flutuante (pagamento, ligada via `forecast.transaction_id`)
3. `transactions.event_id = SUB, parent_transaction_id`, `amount÷N` (TX-filha já no sub)

Nos modos Realized/Committed o card do sub seleciona TX por `event_id=sub` — as TX-filhas entram naturalmente, sem quota. Só no modo Forecast aplicamos a quota MAX(previsto÷N, Σ filhas) para mostrar a apropriação completa (incl. previsto-não-pago).

### Diferença vs `masterForecastShare` antigo
- O antigo `masterForecastShare` era overhead-only (÷N de `is_overhead=true`) e duplicava com `expandOverheadToSplits` no DRE/Sócios.
- A nova apropriação é só do card Forecast, distinta do mecanismo overhead, com critério estrito de TX-filha e MAX por categoria.

### Única expansão virtual em superfícies globais: overhead
`is_overhead=true` é expandido por `expandOverheadToSplits` / `bp_overhead_via_master` (÷ N siblings) em DRE, BP, Acerto Sócios, Análise Resultados. Os cards Forecast NÃO duplicam (o MAX já lida com filhas e a expansão overhead vive noutras superfícies).

## Cachê
`cacheImpact` (calculado por `useEventCacheImpact`) é somado em todos os modos quando >0.

## Sub-totais — ordem
`Total` é SEMPRE a última linha quando presente.

## localStorage
Chave: `ef-card-mode-{user_id}-{event_id}-{kind}` — guarda só a string de modo, nunca valores monetários.

## Ficheiros
- `src/lib/event-financial-card.ts` — helpers puros (modo, fase, formalidade)
- `src/lib/master-forecast-allocation.ts` — apropriação BP Master Forecast (puro)
- `src/lib/__tests__/master-forecast-allocation.test.ts` — testes Simone
- `src/hooks/useEventFinancialCardData.ts` — fetch + cálculo
- `src/components/EventFinancialCard.tsx` — UI
- `src/pages/EventDetail.tsx` — integração (passa `parentEventId`)
