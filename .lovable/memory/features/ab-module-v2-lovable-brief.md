---
name: A&B v2 — Brief para o Lovable
description: Racional completo do redesign do módulo A&B — do problema à solução — para validação e implementação pelo Lovable.
type: feature
status: aguarda_implementacao
data: 2026-05-04
---

## 1. O PROBLEMA

O módulo A&B actual (`event-ab-calc.ts`, `EventABTab.tsx`, `useEventABScenarios.ts`) foi desenhado para um único modelo de operação: **Concessão/Terceirização simples**. O comentário no topo de `event-ab-calc.ts` confirma:

> "O gerador opera A&B por sua conta. A casa não tem custo: recebe apenas a sua quota-parte sobre a faturação. Custo casa = 0."

### Estrutura actual das tabelas

**`event_ab_config`** (1 registo por evento):
- `per_capita_alimentos`, `repasse_alimentos_pct`, `fee_alimentos` — 1 único operador de alimentos, global

**`event_ab_zones`** (N zonas por evento, para bebidas):
- `per_capita_bebidas`, `repasse_bebidas_pct`, `open_bar`, `open_food`, `participants_manual`

### O que falta

A realidade operacional tem **dois modelos distintos**:

**Modelo A — Terceirização** (existe, mas incompleto):
Um ou mais operadores externos exploram o A&B. A casa recebe fee fixo + % das vendas s/IVA. O risco é do operador. O custo para a casa é zero. Pode haver N operadores distintos por tipo (bebidas por zona, alimentos global).

**Modelo B — Exploração Própria** (não existe):
O evento gere directamente os seus bares e/ou restauração. Compra stock, tem staff, tem custos. Resultado = Receita − Custo, podendo ser negativo.

---

## 2. PREMISSA FUNDAMENTAL — O SIMULADOR FUNCIONA COM ESTIMATIVAS

Em **ambos os modos**, tudo parte de **estimativas per capita × público**. Os parâmetros (per capita, percentagens, custos) são definidos com base em históricos. Os 3 cenários (Real/BE/Forecast) variam apenas o denominador — o número de pessoas.

- **Modo Terceirização:** `per_capita` = consumo estimado/pessoa que o operador vai faturar
- **Modo Exploração Própria:** `per_capita_receita` = receita estimada/pessoa; `per_capita_custo` = custo estimado/pessoa

---

## 3. A SOLUÇÃO PROPOSTA

### Princípios de design

- **Não-destrutivo** — todos os dados e comportamentos existentes continuam a funcionar. Novos campos com DEFAULT preservam o comportamento actual.
- **Modos independentes por tipo** — bebidas e alimentos podem ter modos diferentes no mesmo evento.
- **Sem tabela nova de operadores na v1** — campo de texto livre `operador_nome` é suficiente. Tabela separada fica para v2.

---

### Migration SQL (1 ficheiro, 2 ALTER TABLE)

```sql
-- event_ab_config: modo por tipo + campos exploração própria (alimentos)
ALTER TABLE event_ab_config
  ADD COLUMN ab_mode_bebidas    text NOT NULL DEFAULT 'terceirizacao'
    CHECK (ab_mode_bebidas    IN ('terceirizacao','exploracao_propria')),
  ADD COLUMN ab_mode_alimentos  text NOT NULL DEFAULT 'terceirizacao'
    CHECK (ab_mode_alimentos  IN ('terceirizacao','exploracao_propria')),
  ADD COLUMN per_capita_custo_alimentos  numeric NOT NULL DEFAULT 0,
  ADD COLUMN custo_fixo_alimentos        numeric NOT NULL DEFAULT 0;

-- event_ab_zones: campos exploração própria (bebidas) + label operador
ALTER TABLE event_ab_zones
  ADD COLUMN per_capita_custo_bebidas  numeric NOT NULL DEFAULT 0,
  ADD COLUMN custo_fixo_bebidas        numeric NOT NULL DEFAULT 0,
  ADD COLUMN operador_nome             text;
```

Todos os registos existentes continuam válidos — sem backfill necessário.

---

### Lógica de cálculo — `event-ab-calc.ts`

**Novos campos em `ABZoneInput`:**
```ts
per_capita_custo_bebidas: number;  // modo exploração própria
custo_fixo_bebidas: number;        // modo exploração própria
operador_nome?: string;
```

**Novos campos em `ABFoodConfig`:**
```ts
per_capita_custo_alimentos: number;
custo_fixo_alimentos: number;
operador_nome?: string;
```

**Nova assinatura de `computeTotals()`:**
```ts
function computeTotals(
  zones: ABZoneInput[],
  food: ABFoodConfig,
  modeBebidas: 'terceirizacao' | 'exploracao_propria',
  modeAlimentos: 'terceirizacao' | 'exploracao_propria'
): ABTotals
```

**`computeZone()` — dois ramos:**

Modo Terceirização (comportamento actual, sem mudança):
```
Faturação = participantes × per_capita_bebidas
Receita casa = fee_fixo + Faturação × (repasse_pct / 100)
Custo casa = 0
Resultado = Receita casa
```

Modo Exploração Própria (novo):
```
Receita casa = participantes × per_capita_bebidas
Custo casa   = participantes × per_capita_custo_bebidas + custo_fixo_bebidas
Resultado    = Receita casa − Custo casa  (pode ser negativo)
```

**Novos campos em `ABTotals`:**
```ts
custoCasaBebidas: number;    // 0 em terceirização, real em exploração
custoCasaAlimentos: number;  // 0 em terceirização, real em exploração
custoCasaTotal: number;
// custoTotal (legado deprecated) = custoCasaTotal para backward compat
```

**Impacto crítico:** `useCitySimulator.ts` já lê `abModule.totals[scen].custoTotal` e injeta-o nos custos do Simulador. Com o novo cálculo, este valor passará a ser real no modo exploração própria — **sem necessidade de alterar `useCitySimulator.ts`**.

---

### Hook — `useEventABScenarios.ts`

Carregar `ab_mode_bebidas` e `ab_mode_alimentos` do `event_ab_config` e passá-los para `computeTotals()`. O resto da lógica (construção de inputs por cenário, gestão de participantes) não muda.

---

### UI — `EventABTab.tsx`

**Cada secção (Bebidas e Alimentos) ganha um selector de modo:**
```
[● Terceirização]  [ Exploração Própria]
```

**Campos visíveis por modo:**

| Campo | Terceirização | Exploração Própria |
|---|---|---|
| Per capita (base faturação/receita) | ✓ | ✓ |
| % Repasse | ✓ | — |
| Fee fixo | ✓ (alimentos) | — |
| Per capita custo | — | ✓ |
| Custo fixo | — | ✓ |
| Operador (texto livre) | ✓ (opcional) | ✓ (opcional) |

**KPIs do cabeçalho por modo:**

Terceirização (actual):
- Faturação A&B (gerador) / Receita A&B (casa) / Parte do gerador / Margem

Exploração Própria (novo):
- Receita estimada / Custo estimado / **Resultado** (verde se ≥ 0, vermelho se < 0)

---

### O que NÃO muda

- `useCitySimulator.ts` — sem alteração
- `TourSimulator.tsx` — sem alteração
- Testes existentes continuam a passar (novos parâmetros têm defaults)

---

## 4. SEQUÊNCIA DE IMPLEMENTAÇÃO

1. **Migration SQL** — 2 ALTER TABLE, sem backfill
2. **`event-ab-calc.ts`** — novos campos nos tipos, dois ramos em `computeZone()`, novo parâmetro em `computeTotals()`
3. **Testes** — adicionar fixtures e casos de teste para modo exploração própria
4. **`EventABTab.tsx`** — selector de modo + campos condicionais + campo operador + KPIs adaptativos
5. **`useEventABScenarios.ts`** — ler `ab_mode_*` do config e passar para `computeTotals()`
6. **`useCitySimulator.ts`** — **sem alteração necessária**

---

## 5. PONTOS PARA O LOVABLE CONFIRMAR ANTES DE IMPLEMENTAR

1. **Modos independentes por tipo** (bebidas ≠ alimentos) — concordas, ou preferes um único `ab_mode` para o evento inteiro?
2. **Reutilização de `per_capita_bebidas` como base de receita** no modo exploração própria — concordas com esta semântica, ou preferes campo separado `per_capita_receita_bebidas` para evitar ambiguidade?
3. **Testes** — usar as mesmas fixtures (Pista/VIP/Backstage) para os novos casos, ou criar zonas novas?
4. **`auto_sync_bp`** (sync A&B → Business Plan, flag ainda não activa) — no modo exploração própria, o sync propagaria receita + custo como linhas BP separadas? Ou isso fica para v2?
