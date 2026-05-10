---
name: Simulator BE surplus mode
description: Card BE no Simulador mostra ponto de equilíbrio real mesmo quando ultrapassado (solver inverso)
type: feature
---

Decisão (2026-05-10): o card **Break Even** no Simulador (EventSimulator +
TourSimulator via `useCitySimulator`) deve mostrar SEMPRE a configuração que
zera o resultado, mesmo quando o evento já passou o BE. Antes da mudança,
quando `baseRes.general >= 0` o solver fazia early-return e o card mostrava
"Real com per-capita BE" (resultado > 0), o que contradizia o nome.

## Solver `solveBreakEven` (`src/lib/event-simulator-coala.ts`)

`BreakEvenSolution` tem 3 modos:
- `deficit`: falta vender N bilhetes para chegar a 0 (lógica original).
- `surplus`: já passou o BE — solver INVERSO calcula quantos bilhetes a MENOS
  ainda zeravam o resultado. Campos novos: `surplus`, `totalRemovedTickets`.
  `breakdown[].extra_qty` fica NEGATIVO para indicar remoção.
- `exact`: `|baseRes.general| <= 0.5`.

Solver inverso (mode=surplus):
- Distribui surplus por zona, ponderado por `velocity × margPrice`.
- Margem usada = APENAS preço do bilhete (NÃO inclui A&B). Razão: o A&B do
  cenário BE fica ancorado ao público real (via `beAttendance` / `bePubProjected`
  que vem de `beDaily.expanded`, sem syntheticSales para extras negativos).
  Se incluísse A&B no margin, removeríamos menos bilhetes e o resultado não
  fecharia em ~0.
- "Des-vende" do último lote vendido para trás (lots ordenados desc por
  `lot_number`, consome `sold` de cada lot).
- Apenas o anchor da zona absorve a remoção; duplicatas dia-a-dia ficam neutras.

## UI (`BreakEvenSummary` em `EventSimulator.tsx`)

- mode=`surplus`: chip verde `+€X · −N bilh.` com popover "Margem de segurança"
  detalhando a remoção sugerida por zona.
- mode=`exact`: badge "Já no break-even".
- mode=`deficit`: chip âmbar (lógica original).

## Cuidado

`buildDailyFromBreakdown` ignora extras `<= 0` (linha 785), então em surplus
mode `beDaily` reflete real attendance — confirma o invariante de que A&B
não escala com a remoção.
