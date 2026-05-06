## Problema

A&B nas colunas **BE** e **Forecast** continua igual à coluna **Real** mesmo quando o público projectado difere muito (ex.: Forecast 21.881 vs Real 17.215). O fix anterior em `useEventABScenarios` (override do caller a vencer o canónico) está correcto — mas o override **chega vazio** ao hook.

## Causa

Em `src/pages/EventSimulator.tsx`, o helper `sumByZone` (dentro de `abParticipants`, ~linha 826) lê `r.zone_label`:

```ts
const k = (r.zone_label || "").toLowerCase();
```

Mas as linhas em `dailyAttendance`, `beDaily.expanded` e `fcDaily.expanded` vêm de `expandLotSalesToDailyAttendance` (`src/lib/event-attendance-calc.ts:46,85`), que produz linhas com a chave **`zone_name`** — nunca `zone_label`.

Resultado: `abParticipants.real`, `.breakeven` e `.forecast` ficam sempre `{}`. Em `useEventABScenarios`:
- Real: cai no canónico (vendas reais) — coincidência funcional, sem bug visível.
- BE/Forecast: como o override é vazio, cai no canónico (planeado dos lotes), que não escala com o solver. Daí a A&B colada ao Real.

## Solução

Em `EventSimulator.tsx`, ajustar `sumByZone` para aceitar `zone_name` **ou** `zone_label` (defensivo, caso algum solver futuro use a outra chave):

```ts
const sumByZone = (rows: Array<{ zone_label?: string; zone_name?: string; paying: number; courtesy: number }>) => {
  const m: Record<string, number> = {};
  for (const r of rows) {
    const label = (r.zone_name || r.zone_label || "").toLowerCase();
    if (!label) continue;
    m[label] = (m[label] ?? 0) + Number(r.paying || 0) + Number(r.courtesy || 0);
  }
  return m;
};
```

Sem alterações em `useEventABScenarios`, `event-ab-calc.ts`, `event-simulator-coala.ts`, `event-simulator-sync.ts` ou `ExecutiveDashboard.tsx`. O `ExecutiveDashboard` consome `abModule.totals` indirectamente via os mesmos hooks, mas o problema é puramente de chave no Simulador.

## Validação

1. Abrir Simulador num evento com módulo A&B configurado (ex.: Coala — zonas "Relvado — Sábado", "Tenda VIP — Domingo", etc., todas com `source_ticket_zone_id` preenchido e `participants_manual` nulo, conforme auditoria à BD).
2. Confirmar que o nome das zonas A&B bate com o `zone_name` que `expandLotSalesToDailyAttendance` produz (vem de `event_ticket_zones.name` — já confirmado igual em todas as 6 zonas auditadas).
3. Mexer no slider Forecast e ver A&B Bebida / A&B Alimento / Resultado A&B / TM A&B variarem na coluna Forecast.
4. Confirmar que a coluna Real continua estável (não muda com sliders).

## Edge case conhecido

As zonas "Passe 2 dias" (`Relvado (Passe 2 dias)`, `Tenda VIP (Passe 2 dias)`) têm `source_ticket_zone_id = NULL` no módulo A&B. Para essas, o override por `zone_label` (agora `zone_name` lowercased) é o **único** caminho — daí ser crítico que o lookup funcione. Confirmar visualmente que essas zonas também escalam.
