## Bug

No Dashboard Executivo do Simulador, na tabela "Indicadores por pessoa":

- **Real**: TM A&B Bebidas 3,68 € + Alimentos 1,35 € = 5,03 €/pp ✅
- **Break-Even**: 5,03 €/pp ✅
- **Forecast**: 2,89 € + 1,06 € = 3,95 €/pp ❌ (devia ser 5,03 €/pp)

## Causa raiz

No `EventSimulator.tsx`, `fcAB` é construído via `scaleABFromReal(forecastV2, todayAB, …)`. O helper devolve corretamente `drinkRevenue/foodRevenue` escalados (ex.: 21.881 × 5,03 ≈ 110.065 €), mas faz **spread parcial**:

```ts
const scaled = scaleABFromReal(forecastV2, todayAB, …);
return { ...forecastV2, ...scaled };
```

`scaled` só inclui `drinkRevenue/foodRevenue/totalRevenue`. Os campos `attendanceQty` e `attendanceCourtesyQty` permanecem os do `forecastV2` — que vêm de `fcAttendance` (público projectado: 21.881).

No `ExecutiveDashboard.tsx` (linhas 167–178), o TM é calculado:
```
TM Bebida(Forecast) = drinkRevenue(Forecast) / (attendanceQty + attendanceCourtesyQty)(Forecast)
                    = 110.065 / (público forecast)
```

Mas o que vejo (2,89 €) corresponde a `86.563 / 21.881 × algo`… na verdade o bug é mais subtil: **o `drinkRevenue`/`foodRevenue` em `fcAB` NÃO está a vir escalado**. Verificando — o `scaleABFromReal` recebe `realDrink = real.receitaBebidas` (do módulo A&B), mas o `realRev` passado é `todayAB`, cujos `attendanceQty/Courtesy` continuam a ser os do `todayV2` (público real). Isso está correto.

Re-verificando os números: 2,89 € × 21.881 ≈ 63.237 €, e 1,06 × 21.881 ≈ 23.194 €. Soma ≈ 86.431 € — exactamente a receita A&B do **Real** (86.563 €). Confirma-se: `drinkRevenue/foodRevenue` mostrados em Forecast são os valores do Real, divididos pelo público Forecast → o `scaleABFromReal` **não está a ser aplicado** no caminho que alimenta o Dashboard.

Olhando o código:
- `fcAB` (linhas 875–880) usa `scaleABFromReal` ✅
- MAS `ExecutiveDashboard` recebe `forecast={fcAB}` (linha 1072) ✅

O problema tem de estar a montante. Hipóteses fortes:

1. `abModule.totals` está a devolver `forecast.receitaBebidas/Alimentos` iguais ao Real (porque o módulo A&B usa `participants_manual` ou snapshot) — mas isso não importa, porque no fcAB usamos `real.receitaBebidas/Alimentos` como base de per-capita, **não** `forecast.receita…`. Logo `fcAB.drinkRevenue` deveria estar a ~110k.

2. Mais provável: o `ExecutiveDashboard` no cálculo de TM **não usa `forecast.drinkRevenue`** — usa diretamente `abModule.totals.forecast.faturacaoTotal` algures, OU a tabela "Receitas → A&B" usa `forecast.drinkRevenue + forecast.foodRevenue` mas a linha de TM Bebidas/Alimentos lê de outro sítio.

Confirmação no código: linhas 212–213 usam `tmDrink(forecast, fcKpis)` que faz `forecast.drinkRevenue / (attendanceQty + attendanceCourtesyQty)`. Se `forecast.drinkRevenue` fosse 110k (escalado) e o público fosse 21.881, daria 5,03 €/pp. Como dá 2,89 €/pp, **`forecast.drinkRevenue` no objecto passado ao Dashboard está a 63k (≈ valor Real)**.

Conclusão: o spread `{ ...forecastV2, ...scaled }` em `fcAB` deveria sobrepor — mas algures algum consumer está a ler `forecastV2` em vez de `fcAB`, OU o `scaled.drinkRevenue` está a sair zero/igual ao real porque `realDrink` passado é o `todayV2.drinkRevenue` (não o do módulo A&B).

Reler: `const real = abModule.totals.real; scaleABFromReal(forecastV2, todayAB, real.receitaBebidas, real.receitaAlimentos)`. Isto está correto. Per-capita = `real.receitaBebidas / publicOf(todayAB)`. `publicOf(todayAB)` usa `todayAB.attendanceQty + todayAB.attendanceCourtesyQty` (público real, ex.: 17.215). Aplica `scenPub × perCapita`, com `scenPub = publicOf(forecastV2)` = público forecast (21.881). Resultado = 21.881 × (86.563 / 17.215) = 110.065 €. ✅

Então **porque o Dashboard mostra 2,89/1,06?** Resta uma hipótese: o `forecastV2.attendanceQty/Courtesy` está a 17.215 (igual ao real) — i.e. `fcAttendance` está a colapsar para o público real. Nesse caso `scenPub = realPub`, scaling devolve `drink = realDrink` (~63k), e o Dashboard divide 63k / 21.881 = 2,89 €. ✔ Bate!

**Causa real: `forecastV2.attendanceQty` é o público real, não o forecast.** O `fcAttendance` só agrega presenças "expandidas" do `fcDailyTotals` que vêm do solver Forecast — quando o solver não preenche presenças (ou quando `attendance.payingAttendance` é igual ao `ticketsQty` do solver mas o `computeScenarioRevenue` ignora o override), o campo cai para o real.

Mas o Dashboard mostra **público Forecast = 21.881**, que tem de vir de algures. O `fcTargetQty` provavelmente vem de `fcSolution.totalQty` (não de `forecast.attendanceQty`). E o **denominador** do `tmDrink` no Dashboard:

```ts
const denom = (rev, kpis) => {
  const d = (rev?.attendanceQty ?? 0) + (rev?.attendanceCourtesyQty ?? 0);
  return d > 0 ? d : (kpis?.totalPublic ?? 0);
};
```

Se `forecast.attendanceQty + Courtesy` ≈ 21.881, então `scenPub` no `scaleABFromReal` também ≈ 21.881, e `drinkRevenue` resultante seria 110k → TM 5,03 €. Mas vês 2,89 €. Logo a divisão é por 21.881 mas o numerador é ~63k.

**Conclusão definitiva**: `forecast.drinkRevenue` passado ao Dashboard NÃO é o de `fcAB` (escalado). É o de `forecastV2` ou o original do `computeScenarioRevenue`. Provavelmente algum useMemo ou prop está a usar a variável errada.

## O que vou investigar (e corrigir)

1. **Confirmar com `console.log`** (temporário) ou inspecção LSP que valor tem `fcAB.drinkRevenue` e `fcAB.attendanceQty` no momento do render.

2. **Hipótese principal a fixar**: o helper `scaleABFromReal` faz spread de campos de `rev`, mas o `forecastV2.attendanceQty` (vindo de `computeScenarioRevenue` com `fcAttendance` override) pode estar a 0 quando o solver Forecast não tem `breakdown` válido. `publicOf(forecastV2) = 0` → `scaled.drink = 0`, e `{ ...forecastV2, ...scaled }` deixa o `drinkRevenue` a 0… mas o Dashboard mostra 63k, não 0.

   Logo o spread `{ ...forecastV2, ...scaled }` está a ser feito mas `scaled.drink` ≈ realDrink (porque `scenPub = realPub` quando ambos são iguais ao público real).

3. **Fix proposto**:
   - Em `EventSimulator.tsx`, calcular o `scenPub` de `fcAB` **a partir do `fcSolution.totalQty + cortesias` ou do `fcDailyTotals` agregado**, e injectá-lo no `forecastV2` ANTES de chamar `scaleABFromReal`. Garantir que `forecastV2.attendanceQty + attendanceCourtesyQty` reflecte o público projectado do cenário, não o real.
   - Mesma correção para `breakevenV2` (mesmo se actualmente está "por sorte" a bater).
   - Adicionar `attendanceQty/attendanceCourtesyQty` ao retorno de `scaleABFromReal` para tornar explícito que o cenário tem o seu próprio público.

4. **Adicionar testes de regressão** em `src/lib/__tests__/event-simulator-ab-scale.test.ts`:
   - Caso: público Real 17.215, receita Real bebidas 63.237 €, alimentos 23.194 €. Cenário Forecast com público 21.881. Esperar `drinkRevenue ≈ 80.367 €` e `foodRevenue ≈ 29.476 €` (⇒ TM /pp = 5,03 €).
   - Caso degenerado: `forecastV2.attendanceQty = 0` mas `scenPubOverride = 21.881` ⇒ deve usar override.

5. **Validar no Dashboard**: TM A&B Bebidas e Alimentos devem aparecer iguais nos 3 cenários (≈ 3,68 € e 1,35 €). A linha "A&B" da tabela Receitas no Forecast deve passar a ~110k €.

## Ficheiros a editar

- `src/lib/event-simulator-ab-scale.ts` — aceitar `scenPubOverride` opcional; devolver `attendanceQty/Courtesy` no resultado.
- `src/pages/EventSimulator.tsx` — calcular público projectado de BE/Forecast a partir de `beSolution`/`fcSolution` (ou `beDailyTotals`/`fcDailyTotals`) e passar como override; ajustar `beAB`/`fcAB` para garantir que os campos `attendanceQty/Courtesy` reflectem o cenário.
- `src/lib/__tests__/event-simulator-ab-scale.test.ts` — adicionar 2 casos de regressão.

Sem alterações em DB, edge functions ou outros módulos.