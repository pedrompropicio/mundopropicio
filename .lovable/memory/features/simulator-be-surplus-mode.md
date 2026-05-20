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

## ExecutiveDashboard — consistência Receita/Custo/Resultado (v5, 2026-05-20)

**Option B deep refactor aplicado.** O solver `solveBreakEven` agora recebe
`economics.abMarginPerPub` derivado dinamicamente de `abModule.totals.real`:

```ts
abMarginPerPubReal =
  (real.receitaBebidas + real.receitaAlimentos − real.custoTotal) / publicReal
```

Aplicado via two-pass em `EventSimulator.tsx` e `useCitySimulator.ts`:

1. **Pass 1** (`beSolutionDraft`): solveBreakEven sem override → alimenta
   `abParticipants` → `useEventABScenarios` → `abModule.totals.real`.
2. **abMarginPerPubReal**: calculado a partir das totals.real.
3. **Pass 2** (`beSolution` final): re-solve com `economics.abMarginPerPub`
   alinhado ao per-capita real. Todas as derivações downstream
   (beDaily, beAttendance, breakevenV2, beAB, beCosts, ivaTableBe,
   BreakEvenSummary, ExecutiveDashboard) usam o `beSolution` final.
4. **Correção residual REMOVIDA**: `beRev = beAB` directo (sem subtrair
   `rawBeRes.general` ao `ticketsRevenue`).

Resultado: `Receita − Custo = Resultado` fecha ao cêntimo NA ORIGEM,
sem mascaramento display-side. Coala 2026 deixa de mostrar gap visível.

## Histórico
- v1 (2026-05-10): solver inverso por ondas, margin = price.
- v2 (2026-05-10): solver greedy com `margin = price + abMarginPerPub`.
- v3 (2026-05-10): correção residual ao `ticketsRevenue` do BE.
- v4 (2026-05-20): heurística passe vs bilhete-dia no solver surplus +
  dashboard passa `beRev` (não `beAB`) para evitar inconsistência visual.
- v5 (2026-05-20): Option B deep — `abMarginPerPub` injectado no solver
  via two-pass; correção residual eliminada.

