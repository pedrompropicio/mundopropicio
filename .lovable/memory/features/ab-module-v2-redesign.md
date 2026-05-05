---
name: Módulo A&B v2 — Redesign (Terceirização + Exploração Própria)
description: Racional, arquitectura e plano de implementação do redesign do módulo A&B para suportar dois modos de operação e múltiplos operadores.
type: feature
status: em_implementacao
data_analise: 2026-05-04
---

## Contexto e problema

O módulo A&B (Alimentos & Bebidas) existente suporta apenas um único modelo de operação: **Concessão/Terceirização simples** com um único operador por tipo. A estrutura actual em `event-ab-calc.ts` assume sempre custo da casa = 0 (o operador assume todo o risco) e tem apenas um operador global para alimentos.

### Necessidade identificada

O evento pode operar A&B em dois modos distintos (podendo combinar ambos):

1. **Modo Terceirização** — o operador opera por sua conta, a casa recebe fee fixo + % das vendas s/IVA. Pode haver N operadores distintos para bebidas (por zona) e para alimentos.
2. **Modo Exploração Própria** — o evento gere directamente bares e/ou restauração, assumindo receitas e custos. Resultado = Receita - Custo (pode ser negativo).

### Premissa fundamental (validada 2026-05-04)

Em ambos os modos, **tudo parte de estimativas per capita × público**. Os 3 cenários (Real/BE/Forecast) variam apenas o denominador (número de pessoas). O per capita vem de históricos de edições anteriores.

- **Modo Terceirização:** per_capita = consumo estimado por pessoa (base da faturação do operador)
- **Modo Exploração Própria:** per_capita_receita = receita estimada/pessoa; per_capita_custo = custo estimado/pessoa (CMV + operação)

---

## Estado actual do código

### Tabelas DB

**`event_ab_config`** (1 registo por evento):
- `fee_alimentos`, `repasse_alimentos_pct`, `per_capita_alimentos`
- `auto_sync_bp` (flag futura, ainda não activa)

**`event_ab_zones`** (N zonas por evento, para bebidas):
- `zone_label`, `source_ticket_zone_id`, `sort_order`
- `per_capita_bebidas`, `repasse_bebidas_pct`
- `open_bar` (boolean — zona com open bar, bebidas = 0)
- `open_food` (boolean — zona excluída do cálculo de alimentos)
- `participants_manual` (override manual de público)

### Ficheiros chave

- `src/lib/event-ab-calc.ts` — cálculos puros (159 linhas)
- `src/components/EventABTab.tsx` — UI de configuração (502 linhas)
- `src/hooks/useEventABScenarios.ts` — hook de cálculo nos 3 cenários (128 linhas)
- `src/lib/__tests__/event-ab-fixtures.ts` — fixtures de teste (zonas Pista/VIP/Backstage)

### Limitação actual

`computeTotals()` assume `custoCasa = 0` sempre. No modo exploração própria isto está errado — o custo existe e afecta o resultado.

---

## Arquitectura v2

### Princípio de design

- Mudanças **não-destrutivas** — dados existentes continuam a funcionar (defaults para terceirização)
- Bebidas e alimentos podem ter modos **independentes**
- Sem nova tabela de operadores na v1 — usar campo de texto `operador_nome` (label livre)
- Multi-operador de alimentos fica para v2 (nova tabela `event_ab_food_operators`)

### Migração SQL (única migration)

```sql
-- event_ab_config: modo por tipo + campos exploração própria alimentos
ALTER TABLE event_ab_config
  ADD COLUMN ab_mode_bebidas text NOT NULL DEFAULT 'terceirizacao'
    CHECK (ab_mode_bebidas IN ('terceirizacao', 'exploracao_propria')),
  ADD COLUMN ab_mode_alimentos text NOT NULL DEFAULT 'terceirizacao'
    CHECK (ab_mode_alimentos IN ('terceirizacao', 'exploracao_propria')),
  ADD COLUMN per_capita_custo_alimentos numeric NOT NULL DEFAULT 0,
  ADD COLUMN custo_fixo_alimentos numeric NOT NULL DEFAULT 0;

-- event_ab_zones: campos exploração própria bebidas + label operador
ALTER TABLE event_ab_zones
  ADD COLUMN per_capita_custo_bebidas numeric NOT NULL DEFAULT 0,
  ADD COLUMN custo_fixo_bebidas numeric NOT NULL DEFAULT 0,
  ADD COLUMN operador_nome text;
```

### Lógica de cálculo — event-ab-calc.ts

**Novos campos em ABZoneInput:**
```ts
per_capita_custo_bebidas: number;  // modo exploração
custo_fixo_bebidas: number;        // modo exploração
operador_nome?: string;
```

**Novos campos em ABFoodConfig:**
```ts
per_capita_custo_alimentos: number;
custo_fixo_alimentos: number;
operador_nome?: string;
```

**computeZone() — modo exploração própria:**
```
Receita = participantes × per_capita_bebidas
Custo   = participantes × per_capita_custo_bebidas + custo_fixo_bebidas
Resultado = Receita - Custo  (pode ser negativo)
```

**computeZone() — modo terceirização (existente):**
```
Faturação = participantes × per_capita_bebidas
Receita   = fee_fixo + faturação × repasse_pct/100
Custo     = 0
Resultado = Receita
```

**computeTotals() — nova assinatura:**
```ts
function computeTotals(
  zones: ABZoneInput[],
  food: ABFoodConfig,
  modeBebidas: 'terceirizacao' | 'exploracao_propria',
  modeAlimentos: 'terceirizacao' | 'exploracao_propria'
): ABTotals
```

**ABTotals — novos campos:**
```ts
custoCasaBebidas: number;    // 0 em terceirização, real em exploração
custoCasaAlimentos: number;  // 0 em terceirização, real em exploração
custoCasaTotal: number;
// Nota: custoTotal (legado) = custoCasaTotal para backward compat
```

**Impacto em useCitySimulator.ts:**
Já usa `abModule.totals.real.custoTotal` correctamente. Com o novo cálculo este valor passará a ser real (não zero) no modo exploração — sem necessidade de mudança no hook.

### UI — EventABTab.tsx

Adicionar selector de modo no cabeçalho de cada secção:

**Secção Bebidas (por zona):**
- Toggle: `[● Terceirização] [ Exploração Própria]`
- Terceirização: per_capita + % repasse (existente)
- Exploração Própria: per_capita receita + per_capita custo + custo fixo
- Campo `operador_nome` (texto livre, opcional) em cada linha

**Secção Alimentos (global):**
- Toggle: `[● Terceirização] [ Exploração Própria]`
- Terceirização: fee fixo + % repasse + per_capita (existente)
- Exploração Própria: per_capita receita + per_capita custo + custo fixo
- Campo `operador_nome` (texto livre, opcional)

**KPIs do cabeçalho:**
- Terceirização: Faturação / Receita casa / Parte gerador / Margem (existente)
- Exploração Própria: Receita / Custo / **Resultado** (pode ser negativo, cor vermelha)

---

## Sequência de implementação

1. **Migration SQL** — 1 ficheiro, não destrutivo, tabelas event_ab_config e event_ab_zones
2. **event-ab-calc.ts** — estender tipos + computeZone() + computeTotals() para 2 modos
3. **Testes** — actualizar event-ab-fixtures.ts + event-ab-calc.test.ts (cobertura modo exploração)
4. **EventABTab.tsx** — selector de modo + campos condicionais por secção
5. **useEventABScenarios.ts** — passar modeBebidas/modeAlimentos para computeTotals()
6. **useCitySimulator.ts** — sem mudança necessária (já propaga custoTotal)

---

## Decisões tomadas

- v1 sem tabela de operadores separada — label livre `operador_nome` é suficiente
- Multi-operador de alimentos (N operadores) fica para v2
- Bebidas e alimentos têm modos independentes (um pode ser terceirização, outro exploração)
- Backward compat total — `custoTotal` legado = `custoCasaTotal`
- Cenários (Real/BE/Forecast) variam sempre o público; os parâmetros per capita são partilhados entre cenários
