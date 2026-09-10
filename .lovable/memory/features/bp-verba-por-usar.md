---
name: Verba por usar (Fecho do Evento)
description: Painel de revisão no Fecho que lista, por rubrica, a verba de BP não consumida; espelho de computeOutsideBpExcess; reconhecimento append-only em event_bp_review_acks
type: feature
---

# Verba por usar — painel de revisão no Fecho do Evento

Espelho do "excesso por rubrica" (D2 / `event-cost-basis.md`), do outro lado do sinal.

## Cálculo — `src/lib/event-cost-basis.ts`

- `computeUnusedBudget(forecasts, transactions, withVat)` → `UnusedBudgetEntry[]`
  (`key`, `forecast`, `realized`, `unused`), só onde `previsto − realizado > EXCESS_EPSILON`,
  ordenado por `unused` decrescente.
- O agrupamento por `category_id` foi extraído para o helper interno `groupByCategory`,
  partilhado com `computeOutsideBpExcess` (assinatura e resultado desta ficaram intactos).
- IVA sempre linha a linha (Art.º 18 CIVA).

## Painel — `src/components/fecho/BpUnusedBudgetPanel.tsx`

Renderizado em `EventFecho` logo depois da "Síntese Operacional (sem overhead)".
O painel **não renderiza** quando `event_budget_mode(event_id) = 'without_bp'` (nem enquanto
essa RPC está a carregar) — eventos sem BP não têm verba por usar.
Recebe por props `operationalForecasts`, `expenseTx` e `basis` — **não faz queries para
o cálculo**. As únicas queries são: rubricas em falta (`account_categories`, só os
`category_id` que não vêm nas transações), o último reconhecimento e o nome de quem o fez.

A badge do cabeçalho mostra SÓ o critério de IVA (`Despesas c/IVA` | `s/IVA`) — o painel
compara sempre previsto contra realizado, não segue `basis.expenseSource` nem o overhead.

Texto fixo, literal: *"Lista de revisão, não de erro. Faturas de um evento podem chegar
depois de ele acontecer — o valor que deve ficar em cada linha é decisão de gestão."*

Rubrica sem realizado leva badge "sem transações". Sem linhas → "Nenhuma rubrica com
verba por usar."

## Reconhecimento — `public.event_bp_review_acks`

Append-only (`SELECT` + `INSERT` apenas). Colunas: `event_id`, `company_id`,
`acknowledged_by` (default `auth.uid()`), `acknowledged_at`, `unused_net`, `lines_count`,
`note`. Índice `(event_id, acknowledged_at desc)`.

RLS pelo padrão do módulo (igual a `event_forecast_formalidade_log`):
PERMISSIVE `SELECT` a autenticados + RESTRICTIVE `company_isolation` por
`current_company_id()`; `INSERT` exige `has_permission_in(auth.uid(),'manage_bp', company_id)`.

`unused_net` é gravado **sempre s/IVA**, independente do seletor da vista; `lines_count`
é o número de rubricas listadas. Rodapé: sem registo → só o botão; registo a bater
(±0,01 € e mesmo `lines_count`) → "Revisto por … em …"; a não bater → badge
"Revisão desactualizada" + botão. Botão só com `manage_bp` (mesmo mecanismo do `canEditBP`).

Não toca em `event_close_blockers`, no cálculo do resultado nem no acerto com sócios.
