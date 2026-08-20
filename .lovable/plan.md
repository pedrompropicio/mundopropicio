# A&B — Facturação realizada do operador (override do per capita)

## Resposta às 3 perguntas de desenho

### 1. Interacção com os 3 cenários — concordo contigo
A facturação real aplica-se **só ao cenário "Real"**. Break Even e Forecast continuam a usar
`participantes × per capita`, senão os sliders do Simulador deixam de mexer em A&B depois do
fecho e o BE deixa de ser um ponto de equilíbrio (passaria a ser uma constante).

Implementação: o override **não** entra em `computeTotals` como campo global. Entra como campo
por-cenário: `useEventABScenarios` só o passa quando `scen === "real"`. `computeTotals` recebe
um valor já resolvido (número ou `null`) e não sabe de cenários — mantém-se pura.

Efeito colateral desejável: `scaleABFromReal` (usado em `useCitySimulator` e `EventSimulator`)
escala BE/Forecast a partir do rácio contra o A&B **real**. Se o real passar a vir do POS, o
escalamento passa a ancorar no número verdadeiro — melhoria, não regressão.

### 2. Duplicação com o card "Realizado (fecho)" — não derivar, mas reconciliar
Derivar automaticamente é tentador mas errado aqui: `useEventABRealized` lê a **nossa quota já
líquida** (a transação de 29.613,50 €), não a facturação do operador (98.711,67 €). Não há forma
fiável de inverter — a % de repasse pode mudar, há fee fixo nos alimentos, e há eventos com
bebidas e alimentos no mesmo lançamento. Inverter 29.613,50 ÷ 0,30 recriaria exactamente o
problema dos "dois números para a mesma verdade" que quiseste evitar.

Proposta: **uma fonte para cada coisa, com reconciliação visível.**
- A facturação bruta do operador é input manual (é um documento do operador, não existe na nossa BD).
- A nossa quota realizada continua a vir das transações (`useEventABRealized`).
- A UI compara: `receitaAlimentos` calculada (98.711,67 × 30% = 29.613,50) vs `receita` do card
  Realizado. Se divergirem mais de 0,05 €, badge de aviso âmbar no bloco Alimentos e no card
  Realizado, com os dois valores e a diferença. Se baterem, badge verde "conciliado".
- Sem escrita automática em nenhum dos lados. `auto_sync_bp` continua desligado.

### 3. Migration — nada parte
Duas colunas novas, `numeric` nullable, sem default, sem tocar em colunas existentes nem em RLS:
- `public.event_ab_config.faturacao_real_alimentos numeric NULL`
- `public.event_ab_zones.faturacao_real_bebidas numeric NULL`

Consumidores verificados: `useCitySimulator`, `EventSimulator`, `EventSimulatorDemo`, `ReportDRE`,
`EventABTab`, `event-simulator-ab-scale`, `event-simulator-calc`. Todos leem `computeTotals` por
campos de saída (`receitaBebidas`, `receitaAlimentos`, `custoTotal`) — a assinatura de saída não
muda e os campos legados mantêm-se. Quem constrói inputs sem os campos novos (`ReportDRE` linha
401, testes) fica com `undefined` → tratado como nulo → comportamento actual byte-a-byte igual.

## Regra de cálculo

Helper único em `event-ab-calc.ts`:

```text
resolveFaturacao(real, participantes, perCapita):
  real != null && Number.isFinite(real)  ->  real        (0 é válido)
  caso contrário                          ->  participantes × perCapita
```

Aplicada nos dois modos:
- `terceirizacao`: `receita = fee + faturacao × repasse%`  (fee/repasse inalterados)
- `exploracao_propria`: `receita = faturacao`; o **custo** continua
  `participantes × per_capita_custo + custo_fixo` (o real substitui receita, não custo)
- `open_bar` / `open_food` continuam a zerar antes de tudo — não mexo em
  `participantesElegiveisAlimentos` nem no `open_food`

`nulo ≠ zero`: uso `== null` explícito, nunca `|| 0`, nos novos campos.

## Ficheiros

| Ficheiro | Mudança |
|---|---|
| `supabase/migrations/<ts>_ab_faturacao_real.sql` | 2 colunas nullable + `COMMENT ON COLUMN` |
| `src/lib/event-ab-calc.ts` | `faturacao_real_bebidas?: number \| null` em `ABZoneInput`, `faturacao_real_alimentos?: number \| null` em `ABFoodConfig`, helper `resolveFaturacao`, uso em `computeZone` e no bloco de alimentos |
| `src/hooks/useEventABScenarios.ts` | passa os campos reais **apenas** em `scen === "real"`; `null` nos outros |
| `src/components/EventABTab.tsx` | campo "Facturação real do operador (s/IVA)" no bloco Alimentos e por zona nas Bebidas, com placeholder "vazio = calcular por per capita" e botão para limpar (voltar a nulo); badge de reconciliação |
| `src/components/EventABRealizedSection.tsx` | badge de divergência espelhado |
| `src/lib/__tests__/event-ab-calc.test.ts` | casos: real preenchido nos 2 modos, real = 0, real nulo (regressão), open_bar/open_food com real preenchido |

## Fora de âmbito
Sem publicação, sem escrita no BP, sem alteração a `participantesElegiveisAlimentos`/`open_food`,
sem alteração de RLS. A migration é aplicada em Test via ferramenta de migração; o Publish para
Live fica para ti.
