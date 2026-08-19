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
