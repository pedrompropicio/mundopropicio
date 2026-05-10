---
name: Simulator BE surplus mode
description: Card BE no Simulador mostra ponto de equilíbrio real mesmo quando ultrapassado (solver inverso)
type: feature
---

Decisão (2026-05-10): o card **Break Even** no Simulador (EventSimulator +
TourSimulator via `useCitySimulator`) deve mostrar SEMPRE a configuração que
zera o resultado, mesmo quando o evento já passou o BE.

## Solver `solveBreakEven` (`src/lib/event-simulator-coala.ts`)

`BreakEvenSolution.mode`: `deficit` | `surplus` | `exact`.

### Modo `surplus` (re-escrito 2026-05-10)
Greedy puro com convergência real:
- Margem por bilhete removido = **lot.price + abMarginPerPub** (A&B líquido).
  Isto reflete o impacto real no resultado quando a presença cai 1: receita de
  bilhete (-price), A&B revenue (-drink_avg-food_avg), A&B cost (+passthrough).
- A cada iteração escolhe a zona com maior `velocity × margin`, "des-vende" do
  topo do último lote vendido para trás, e desconta `take * margin` do remaining.
- Para zonas sem lots com vendas (raro), usa avg ticket como bucket único com
  `left = realQtyZone` para permitir remoção.
- Convergência garantida: termina quando `remaining ≤ 0.005`.

### Pré-requisito UI
A margem só fecha em ~0 se `beAttendance` propagar a redução. Por isso
`buildDailyFromBreakdown` (em `EventSimulator.tsx`) **aplica `extra_qty<0`**:
para cada zona com remoção, subtrai do `expanded` priorizando o `day_index`
âncora; se insuficiente, espalha pelos restantes dias da zona. Isto faz com
que `beAttendance`, A&B e KPIs por presença reflitam o público reduzido.

### Modos auxiliares
- `exact`: `|baseRes.general| <= 0.5` (badge "Já no break-even").
- `deficit`: lógica original (chip âmbar).

## UI (`BreakEvenSummary` em `EventSimulator.tsx`)

- mode=`surplus`: chip verde `+€X · −N bilh.` com popover "Margem de segurança"
  detalhando a remoção sugerida por zona.
- mode=`exact`: badge "Já no break-even".
- mode=`deficit`: chip âmbar (lógica original).

## Histórico
- v1 (2026-05-10): solver inverso por ondas, margin = price (sem A&B). Bug:
  `beDaily` ignorava extras<=0, então A&B mantinha-se ao real e o resultado
  BE ficava acima de zero (~26k €) e o público dia ficava igual ao "Hoje".
- v2 (2026-05-10): solver greedy com `margin = price + abMarginPerPub` +
  `buildDailyFromBreakdown` propaga `extra_qty<0`. Resultado fecha em ~0 e
  público dia reflete a remoção.
