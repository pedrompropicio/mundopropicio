---
name: Event Financial Cards (3 modes)
description: Cards Receitas/Custos no EventDetail com 3 modos (Realizado/Comprometido/Forecast), mini-barra de formalidade e integração com Simulador
type: feature
---

# Event Financial Cards — Receitas & Custos no EventDetail

## Visão geral
Substitui os 2 StatCards estáticos (`Receitas`, `Despesas`) por `<EventFinancialCard>` com 3 modos comutáveis pelo utilizador via dropdown ⚙️ no canto do card. O card `Lucro` reage automaticamente aos displayValues escolhidos (via `onValueChange`).

## 3 modos
- **Realizado** — lógica histórica (paid+approved, hasTicketSales replace, masterExpenseShare, cacheImpact). Sub-totais:
  - Receitas: `Bilheteira / Patrocínio / Outros` (agrupados pelo prefixo L1 do `account_categories.code`: 1.1.* / 1.2.* / outros).
  - Custos: `Pago` vs `Comprometido (approved + extras)`.
- **Comprometido** — Σ `event_forecasts.amount` da versão ativa (`version_id IS NULL`) com `status='approved'`, `is_transitory=false`, `exclude_from_result=false`. Mostra mini-barra horizontal de 4 segmentos com tooltip por segmento (Estimado vermelho / Negociação laranja / Fechado azul / Pago verde). Em custos soma `extraExpense` (masterExpenseShare + cacheImpact).
- **Forecast**
  - Receitas: chama `computeScenarioRevenue(sessions, cfg, scenario)` de `event-simulator-coala.ts`, com `sessions` carregadas de `event_simulator_inputs` e `cfg` de `event_simulator_config`. Toggle `today / breakeven / forecast` no mesmo dropdown ⚙️. Sub-totais: `Bilheteira / Patrocínio / A&B / Outros`.
  - Custos: formalidade-aware. Para cada linha BP approved: se `formalidade ∈ {fechado, pago_parcial, pago_total}` E há TX com a mesma `category_id` no evento → usa Σ TX (paid+approved+pending). Caso contrário usa `forecast.amount`. TX em categorias **não** cobertas pelo BP (órfãs) somam à parte. Sub-totais: `BP / TX realizadas / Forecast total`.

## Mapeamento formalidade
- `estimado` + `negociacao` → BP é o valor de referência (não fechou).
- `fechado` + `pago_parcial` + `pago_total` → TX vinculadas (via category_id+event_id) substituem o BP no forecast de custos. Se não houver TX ainda, cai para BP.

## Integração com Simulador
- Reusa **integralmente** o motor `event-simulator-coala.ts` (sem duplicar lógica). Não chama solver — usa `computeScenarioRevenue` com fallback estático (`scenario='forecast'` aplica `sessionForecastQty/Revenue`).
- Não toca em `EventSimulator.tsx`.

## Fallback A&B
Se `event_simulator_config.default_drink_avg_ticket=0` E `default_food_avg_ticket=0`, sub-total A&B mostra `—` em vez de `0,00 €` (sinaliza que bares não estão configurados).

## Fase automática (modo='auto')
Detectada em `detectPhase()`:
- `completed`: `events.status='completed'` OU hoje > `primaryEventDate`.
- `planning`: `events.status='planning'` OU (sem TX realizadas E sem vendas E hoje < primaryEventDate).
- `development`: caso contrário.

Default por fase:
- planning → `forecast`
- development → `committed`
- completed → `realized`

## localStorage
Chave: `ef-card-mode-{user_id}-{event_id}-{kind}`. Persiste **apenas** a string do modo escolhido — nunca valores monetários. Sem user logged in usa prefixo `anon`.

## Master/Split
Respeita o toggle "Visão Global" existente: o componente recebe `eventIds` (já calculado por EventDetail como `transactionEventIds` = master+subs em visão global, ou apenas o sub seleccionado). Em filho (sub-evento), as 3 componentes extras são passadas separadamente:
- `masterExpenseShare` — TX do Master ÷ N siblings (paid+approved, não transitórias).
- `masterForecastShare` — Forecasts overhead do Master (`is_overhead=true`, approved) ÷ N siblings. **Anti-duplicação:** se a categoria do overhead já tem TX no Master, é ignorado (TX já entra via `masterExpenseShare`). Só somado em modos `committed` e `forecast` (em `realized` o card é só TX).
- `cacheImpact` — Cachê calculado efetivo (via `useEventCacheImpact`).

Em modo `committed` o BP da mini-barra é só do `event_id` do filho; rateios Master aparecem como legenda abaixo (`+ Cachê · + Rateio turnê`). Em `forecast` e `realized` os extras viram subtotais visíveis ("Cachê", "Rateio turnê"). Na visão Master/Global (`masterIdForShare = null`) as 3 quotas são 0 e os forecasts/TXs do Master contam inteiros via `eventIds`.


## Decisões arquiteturais
- **Zero campos novos** no schema.
- Componente reutilizável `<EventFinancialCard kind="income"|"expense">` (não dois separados).
- Lucro reage via callback `onValueChange` (não via Context — escopo limitado a 1 página).
- Sub-totais nunca persistidos — sempre recalculados a partir do query cache.
- Performance: hook usa `useQuery` com `queryKey` por kind+ids+mode, e `useMemo` para o cálculo final.

## Ficheiros
- `src/lib/event-financial-card.ts` — pure helpers (fase, formalidade buckets, localStorage).
- `src/hooks/useEventFinancialCardData.ts` — fetch + cálculo por modo.
- `src/components/EventFinancialCard.tsx` — UI (dropdown ⚙️, mini-barra formalidade, sub-totais).
- `src/pages/EventDetail.tsx` — integração (substitui 2 StatCards, mantém Lucro+Bilhetes).
