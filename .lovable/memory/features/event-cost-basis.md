---
name: Event cost basis
description: Helper único de composição do custo do evento (overhead, transações fora do BP, IVA linha a linha) usado no card da capa, no Fecho e no portal do sócio
type: feature
---

# Composição do custo do evento — `src/lib/event-cost-basis.ts`

Fonte de verdade única para "o que entra no custo do evento".

## Definições
- **IVA linha a linha**: `lineValue(amount, iva_rate, withVat)` usa `calcTotalWithIva`
  de `@/lib/iva` por linha (Art.º 18 CIVA). Nunca aplicar uma taxa média ao total —
  era isso que dava a diferença de cêntimos no card de custos.
- **Overhead**: linhas `event_forecasts.is_overhead` (têm `exclude_from_result = true`).
  Entram por toggle.
- **Transações fora do BP** = **excesso por rubrica**:
  `Σ por category_id de max(realizado − previsto, 0)` (tolerância 0,005 €).
  Transações sem categoria formam bucket próprio e contam por inteiro.
  Esta é a definição canónica — extraída do `bpL3Overrun` do portal do sócio.
  A antiga soma de "órfãs" do `useEventFinancialCardData` foi **rejeitada** pelo Pedro.

## Consumidores
- `useEventFinancialCardData` / `EventFinancialCard` — toggles "Incluir overhead" e
  "Incluir transações fora do BP", ambos default **OFF**, persistidos por user+evento+kind.
  O toggle "fora do BP" só se aplica no modo **Comprometido**.
- `PartnerSettlementTab` e `EventFecho` — via `useFechoBasis` (overhead default ON).
- `PartnerEventDetail` — `computeOverrunMap`/`sumExcess` para os badges de excesso no BP.

## Casos de aceitação (Anitta EDA 2026, `fdfb39fe-45f2-43f5-9ec9-7cb536360ae1`)
Card de custos, modo Comprometido — OH/foraBP:
```
OFF/OFF → 1.546.634,44 s/IVA · 1.798.970,96 c/IVA
ON/OFF  → 1.579.134,44 · 1.838.945,96
OFF/ON  → 1.633.026,11 · 1.891.941,33
ON/ON   → 1.665.526,11 · 1.931.916,33
```
Overhead = 32.500,00 base (+7.475,00 IVA). Excesso fora do BP = 86.391,67 base (+92.970,37 c/IVA).

## 2026-08-20 — "Fora do BP" deixa de ser opção (decisão do Pedro)

**O toggle "Incluir transações fora do BP" foi REMOVIDO** do card da capa e do
Fecho (Encontro de Contas + Geral do evento). Não é default OFF nem escondido:
deixou de existir.

Na base **BP comprometido** o total de despesa é **sempre**
`Σ por rubrica de max(previsto, realizado)` — ou seja, o excesso por rubrica
(`computeOutsideBpExcess`) entra sempre. Motivo: *um total que depende de um
clique produz erro de fecho por esquecimento*. Na base **realizado** nada muda
(só transações; o conceito não se aplica).

O toggle de **overhead mantém-se** (não foi posto em causa).

### Definição válida de excesso
`Σ por category_id de max(realizado − previsto, 0)`, tolerância 0,005 €, IVA
linha a linha. Rubricas sem linha no BP contam por inteiro; TX sem categoria
formam bucket próprio.

### Rótulo
"Comprometido" / "BP comprometido" → **"Previsto + excedido"**, tooltip
*"previsto no BP mais o que já foi gasto acima do previsto, rubrica a rubrica"*.
Aplicado em `EventFinancialCard.tsx` (chip + dropdown), `FechoBasisSelector.tsx`
(chip + radio) e `describeFechoBasis` em `useFechoBasis.ts` (cabeçalho dos PDFs).
Valor interno `"committed"` mantém-se (chaves/localStorage intactos).

### "Tem BP" tem de subir ao Master
A verificação de "esta transação tem linha de BP" tem de subir ao evento master
quando a transação é filha de rateio (`parent_transaction_id` preenchido).
Sem isso, cada cidade de cada turnê parece permanentemente não-conforme.

### O estouro é sinal, não subtotal
O desvio por rubrica continua visível na vista "Previsão vs Real" da grelha do
BP (`EventForecast.tsx`, com bucket "Sem linha específica" para órfãs) e no
relatório BP × Transações (Previsto | Realizado | variação por categoria).

### Casos de aceitação — Anitta EDA 2026 (`fdfb39fe-45f2-43f5-9ec9-7cb536360ae1`)
Excesso = **57.784,01 €**, todo em 2.2.01 Aéreo (99.910,09 previstos vs
157.694,10 realizados, IVA 0 → igual s/ e c/IVA).
```
Overhead OFF → 1.604.418,45 s/IVA · 1.856.754,97 c/IVA
Overhead ON  → 1.636.918,45 s/IVA · 1.896.729,97 c/IVA
```

## PENDÊNCIA IDENTIFICADA — receita (não implementar sem decisão nova)
A regra `max(previsto, realizado)` **não** se aplica à receita, e o problema da
receita **não é o espelho** do custo:
- Só o **Coala PT 2026** tem linhas de receita no BP (19 linhas, 347.917,03 €).
  Todos os outros eventos têm **zero**.
- A previsão de bilheteira vive em `ticket_sales`/Simulador, não em
  `event_forecasts`. Aplicar max() daria "receita = realizado" em todo o lado e
  mascarava a ausência de BP de receita.
- O risco é o **inverso** do custo: em modo comprometido o card de receita fica
  a zero ou "indisponível" por falta de BP → **subavalia**.
- Trata-se com decisão própria (BP de receita obrigatório, ou card de receita
  ignorar o modo comprometido), não com a regra do excesso.
