## Objetivo
Corrigir o Simulador para que a receita A&B de Break-Even e Forecast seja sempre calculada como:

```text
A&B do cenário = público do cenário × per-capita A&B
```

No caso reportado, Forecast deve sair de `86.563 €` para cerca de `110.065 €` quando o público Forecast é `21.881` e o per-capita total A&B é `5,03 €/pp`.

## Diagnóstico
A correção anterior só garantiu que o mapa de participantes chegava ao hook A&B. Porém, em `EventSimulator.tsx`, a função `applyABModule` continua a substituir também BE/Forecast pelos totais retornados pelo módulo A&B:

```ts
const t = abModule.totals[scen]
drinkRevenue = t.receitaBebidas
foodRevenue = t.receitaAlimentos
```

Quando o módulo A&B devolve o mesmo valor do Real (por exemplo por `participants_manual`, mapeamento por zona, ou fallback canónico), esse valor volta a congelar BE/Forecast em `86.563 €`, apesar de `forecastV2` já ter calculado o público correto do cenário.

## Alterações propostas

1. **`src/pages/EventSimulator.tsx`**
   - Alterar `applyABModule` para:
     - manter o módulo A&B como fonte para o cenário **Real**, porque é aí que estão os per-capita/configuração reais do evento;
     - para **Break-Even** e **Forecast**, recalcular a receita A&B a partir do público do próprio cenário, sem reutilizar o valor absoluto Real.
   - A fórmula será baseada no per-capita efetivo do Real:
     ```text
     perCapitaBebidas = receitaBebidasReal / públicoReal
     perCapitaAlimentos = receitaAlimentosReal / públicoReal

     bebidasCenário = públicoCenário × perCapitaBebidas
     alimentosCenário = públicoCenário × perCapitaAlimentos
     ```
   - Usar fallback para `rev.drinkRevenue` / `rev.foodRevenue` quando não houver configuração A&B ou quando o público Real for zero.
   - Garantir que `totalRevenue` é recalculado após substituir Bebidas/Alimentos.

2. **Custos A&B em BE/Forecast**
   - Ajustar `beCosts` e `fcCosts` para que o custo A&B também acompanhe a receita escalada do cenário, em vez de usar diretamente `abModule.totals.breakeven/forecast.custoTotal` quando estes estiverem congelados.
   - Quando houver custo real configurado no módulo A&B, escalar pelo mesmo rácio de público:
     ```text
     custoA&B_cenário = custoA&B_real × (públicoCenário / públicoReal)
     ```
   - Se não houver custo real/configuração, manter o cálculo existente de `computeScenarioCosts`.

3. **`src/hooks/useEventABScenarios.ts`**
   - Rever o comentário/precedência de `participants_manual` para evitar que a leitura futura induza regressão: manual pode continuar válido na aba A&B, mas o Simulador não deve deixar esse valor congelar BE/Forecast.
   - Não alterar o comportamento da aba A&B sem necessidade.

4. **`src/hooks/useCitySimulator.ts`**
   - Aplicar a mesma regra no simulador por cidade, porque ele usa o mesmo hook e a mesma substituição A&B.
   - Assim, Master/Tour agregados via cidades não voltam a herdar A&B congelado.

5. **Testes de regressão**
   - Adicionar/atualizar testes puros para validar a regra:
     - Real: `17.215 × 5,03 ≈ 86.563 €`.
     - Forecast: `21.881 × 5,03 ≈ 110.065 €`.
     - BE/Forecast não podem ficar iguais ao Real quando o público do cenário muda.
   - Preferir extrair uma pequena função pura para cálculo/escalamento A&B, para testar sem depender de React hooks.

## Validação esperada
Depois da implementação:

- Dashboard Executivo, aba Faturamento e exportações que usam `todayAB/beAB/fcAB` passam a mostrar A&B Forecast ≈ `110.065 €` no cenário indicado.
- TM A&B permanece ≈ `5,03 €/pp` nos três cenários.
- Público Forecast continua `21.881`.
- A&B Real mantém `86.563 €` para `17.215` pessoas.