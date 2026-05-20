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
- A cada iteração escolhe a zona com maior `velocity × margin`, "des-vende" do
  topo do último lote vendido para trás, e desconta `take * margin` do remaining.

### Heurística passe vs bilhete-dia (v4, 2026-05-20)
Na atribuição final do `removed` aos breakdown items (modo surplus), se a
mesma `zone_label` aparece em >1 `day_index` com `sessionTodayQty` **idêntico**
em todos → é **passe multi-dia** e a redução fica concentrada no anchor.
Caso contrário (bilhete-dia, festival com vendas independentes por dia) →
o `z.removed` do anchor é **distribuído pro-rata** pelos `groupIdxs` na
proporção de `sessionTodayQty(sessions[i]) / totalReal`. Resolve o bug
Coala 2026 em que toda a remoção caía no sábado e o domingo ficava igual ao
Real. (Mesma heurística já existia em `useCitySimulator.ts` para A&B —
agora aplicada também no solver.)

### Pré-requisito UI
A margem só fecha em ~0 se `beAttendance` propagar a redução. Por isso
`buildDailyFromBreakdown` (em `EventSimulator.tsx`) **aplica `extra_qty<0`**.

## UI (`BreakEvenSummary` em `EventSimulator.tsx`)

- mode=`surplus`: chip verde `+€X · −N bilh.` com popover "Margem de segurança".
- mode=`exact`: badge "Já no break-even".
- mode=`deficit`: chip âmbar.

## ExecutiveDashboard — consistência Receita/Custo/Resultado (v4, 2026-05-20)

O dashboard passa a receber `breakeven={beRev}` (com a correção residual já
aplicada) em vez de `breakeven={beAB}` (sem correção). Antes, Pedro via:

- Receita 1.341.087 €, Custo 1.297.422 €, Resultado 0 € → gap visível de
  43.665 € inexplicado.

Causa: `beRev` aplica `ticketsRevenue = rawBeRev.ticketsRevenue −
rawBeRes.general` (correção residual para forçar Resultado=0), mas o dashboard
estava a renderizar `beAB` (não-corrigido). Fix: `breakeven={beRev}` na linha
~1205 de `EventSimulator.tsx`. Agora Receita = Custo quando Resultado = 0.

### Deferido (Option B profundo)
Aliar `abMarginPerPub` do módulo A&B ao solver via `economics` (parâmetro já
existe na assinatura) eliminaria a necessidade da correção residual na origem.
Requer refactor de ordem de declaração entre `beSolution` (linha 596) e
`abModule` (linha 951) — adiado por scope. A correção display-side acima é
**equivalente** em garantia "Receita − Custo = Resultado ao cêntimo".

## Histórico
- v1 (2026-05-10): solver inverso por ondas, margin = price.
- v2 (2026-05-10): solver greedy com `margin = price + abMarginPerPub`.
- v3 (2026-05-10): correção residual ao `ticketsRevenue` do BE.
- v4 (2026-05-20): heurística passe vs bilhete-dia no solver surplus +
  dashboard passa `beRev` (não `beAB`) para evitar inconsistência visual.
