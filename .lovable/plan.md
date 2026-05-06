## Problema

No card "A&B Bebida/Alimento" do Simulador, as colunas **Break Even** e **Forecast** não escalam com o público projectado — ficam coladas a valores constantes (≈ Real ou ≈ planeado dos lotes), mesmo quando o solver do Simulador projecta lotação maior/menor.

## Causa

`useEventABScenarios` (em `src/hooks/useEventABScenarios.ts`) tem esta prioridade ao escolher o nº de participantes por zona:

1. `participants_manual` na zona A&B (explícito do utilizador)
2. **`source_ticket_zone_id` → `useEventAttendance(scen).totalsByZone`** ← canónico
3. Override passado pelo caller via `zone_label`

Para o Simulador, em BE/Forecast `useEventAttendance` devolve a **quantidade planeada do lote** (`event_ticket_lots.quantity`) — um valor fixo. Como quase todas as zonas têm `source_ticket_zone_id` preenchido, o passo 2 vence sempre e o override calculado pelo Simulador (passo 3) é ignorado. Resultado: A&B BE = A&B Forecast = valor planeado, sem escalar com o público que o Simulador projecta.

## Solução

Inverter a prioridade **apenas para BE e Forecast**: o override do caller (Simulador) vence o lookup canónico baseado em lotes. `participants_manual` continua a vencer sempre (é decisão explícita do utilizador) e o cenário **Real** mantém o comportamento actual (vendas reais > override).

Nova ordem por cenário em `useEventABScenarios`:

| Prioridade | Real (mantém)             | BE / Forecast (novo)              |
|------------|---------------------------|------------------------------------|
| 1          | `participants_manual`     | `participants_manual`              |
| 2          | canónico (vendas reais)   | **override do caller (simulador)** |
| 3          | override do caller        | canónico (planeado dos lotes)      |

## Alterações

**`src/hooks/useEventABScenarios.ts`** — refactor de `buildInputs(scen)`:
- Extrair `externalMap = participants[scen]` por zona via `zone_label.toLowerCase()`.
- Para `scen === "real"`: manter ordem actual (manual → canónico → caller).
- Para `scen === "breakeven" | "forecast"`: nova ordem (manual → caller → canónico).
- Atualizar JSDoc do ficheiro a explicar a nova prioridade por cenário.

Sem alterações em `EventSimulator.tsx`, `event-ab-calc.ts` ou esquema de DB. Testes existentes em `event-ab-*.test.ts` continuam válidos (todos passam `participants` directos a `computeTotals`, não tocam na hook).

## Validação

1. Abrir Simulador num evento com módulo A&B configurado e zonas vinculadas a `source_ticket_zone_id` (sem `participants_manual`).
2. Mover sliders de lotação BE/Forecast e confirmar que **A&B Bebida**, **A&B Alimento**, **Resultado A&B** e **TM A&B** acompanham a variação.
3. Confirmar que coluna **Hoje** continua a usar vendas reais (não muda com sliders).
4. Numa zona com `participants_manual` definido, confirmar que A&B BE/Forecast continua fixo no valor manual.
