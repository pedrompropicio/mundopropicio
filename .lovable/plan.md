## Objetivo

Corrigir 2 bugs e 1 ambiguidade no Simulador, todos com a mesma raiz: mistura de duas unidades de "público" (bilhetes únicos vs presenças×dia).

## Mudanças

### 1. `src/pages/EventSimulator.tsx` (linhas 872–881)

Trocar `bePubProjected` / `fcPubProjected` para usarem **presenças×dia** (mesma unidade do `realRev.attendanceQty` que serve de denominador no `scaleABFromReal`):

```ts
const bePubProjected = useMemo(
  () => Number(beAttendance?.payingAttendance || 0) + Number(beAttendance?.courtesyAttendance || 0),
  [beAttendance],
);
const fcPubProjected = useMemo(
  () => Number(fcAttendance?.payingAttendance || 0) + Number(fcAttendance?.courtesyAttendance || 0),
  [fcAttendance],
);
```

Resolve:
- Card BE com receita < Real (A&B subdimensionado).
- A&B Forecast "congelado" no nível do Real apesar do público crescer.

### 2. `src/hooks/useCitySimulator.ts`

Passar override equivalente ao `scaleABFromReal` / `scaleABCostFromReal` para alinhar Master Tour com EventSimulator (hoje só passa `realRev`, sem override). Usa `beRev.attendanceQty + attendanceCourtesyQty` (já em presenças×dia).

### 3. `src/components/simulator/ExecutiveDashboard.tsx` — barra "Público"

Renomear o card "Público" para **"Bilhetes únicos"** e adicionar linha pequena por baixo a indicar `Presenças×dia: Real / BE / Forecast`. Resolve a confusão da 3ª imagem (11.988 vs 17.215 sem rótulo).

### 4. `src/lib/__tests__/event-simulator-ab-scale.test.ts`

Adicionar caso: BE com público=Real → A&B(BE) ≈ A&B(Real); FC com presenças=21.881 → A&B(FC) ≈ 21.881 × 5,03.

## Resultado esperado (Coala 2026)

- Card BE: Receita ≈ Real (A&B já não cai 83 k €).
- Card Forecast: A&B ≈ 110 k € (em vez dos 86,5 k atuais).
- Barra "Público" do Dashboard rotulada de forma inequívoca.
