---
name: Módulo A&B v2 — Redesign (Terceirização + Exploração Própria)
description: Racional, arquitectura, decisões validadas pelo Lovable e plano de implementação.
type: feature
status: aprovado_para_implementacao
data_analise: 2026-05-04
data_aprovacao: 2026-05-04
---

## 1. O PROBLEMA

O módulo A&B actual suporta apenas Concessão/Terceirização simples com um único operador por tipo e custo da casa sempre igual a zero.

### Estrutura actual das tabelas

event_ab_config (1 registo por evento): per_capita_alimentos, repasse_alimentos_pct, fee_alimentos, auto_sync_bp

event_ab_zones (N zonas, bebidas): per_capita_bebidas, repasse_bebidas_pct, open_bar, open_food, participants_manual, source_ticket_zone_id

### O que falta

Modelo A — Terceirização (incompleto): N operadores por tipo, fee fixo + % vendas s/IVA. Custo casa = 0.

Modelo B — Exploração Própria (inexistente): O evento gere directamente bares/restauração. Resultado = Receita − Custo (pode ser negativo).

---

## 2. PREMISSA FUNDAMENTAL

Em ambos os modos, tudo parte de estimativas per capita × público. Os parâmetros são definidos por históricos. Os 3 cenários (Real/BE/Forecast) variam apenas o número de pessoas (denominador). Os parâmetros per capita são partilhados entre os 3 cenários.

---

## 3. DECISÕES VALIDADAS PELO LOVABLE (2026-05-04)

### 3.1 Modos independentes por tipo → APROVADO
Manter ab_mode_bebidas e ab_mode_alimentos separados. É comum bares próprios + catering terceirizado no mesmo evento.

### 3.2 Reutilizar per_capita_bebidas como base de receita → APROVADO com condição
Mesma coluna DB. Mudar label na UI conforme o modo:
- Terceirização: "Per capita faturação (operador)"
- Exploração Própria: "Per capita receita (casa)"

### 3.3 Testes → fixtures existentes (Pista/VIP/Backstage) + 3 casos novos:
(a) bebidas exploração própria com resultado negativo
(b) bebidas exploração + alimentos terceirização no mesmo evento
(c) custo fixo sem participantes → resultado = -custo_fixo

### 3.4 auto_sync_bp em exploração própria → FICA PARA v2
Flag ainda não activa. Documentar como TODO no código.

---

## 4. PONTOS ADICIONAIS DO LOVABLE

### 4.1 ABTotals.custoTotal deprecated mas mantido
useCitySimulator.ts continua a ler custoTotal (= custoCasaTotal). Adicionar @deprecated use custoCasaTotal em JSDoc.

### 4.2 Memória nova após implementação
Criar ab-module-dual-mode.md documentando os 2 modos, semântica contextual de per_capita_bebidas, e regra de que custo real só flui ao Simulador via exploração própria.

### 4.3 Validação UI — não apagar campos ao trocar de modo
Ao alternar modos na UI, os valores ficam em DB (defaults). A UI apenas mostra/oculta campos conforme o modo activo.

### 4.4 Edge case — participants_manual em exploração própria
Se participants_manual está definido, o custo per capita usa o mesmo denominador que a receita. Confirmar explicitamente em computeZone().

---

## 5. ARQUITECTURA TÉCNICA

### Migration SQL (1 ficheiro, 2 ALTER TABLE, sem backfill)

ALTER TABLE event_ab_config
  ADD COLUMN ab_mode_bebidas text NOT NULL DEFAULT 'terceirizacao'
    CHECK (ab_mode_bebidas IN ('terceirizacao','exploracao_propria')),
  ADD COLUMN ab_mode_alimentos text NOT NULL DEFAULT 'terceirizacao'
    CHECK (ab_mode_alimentos IN ('terceirizacao','exploracao_propria')),
  ADD COLUMN per_capita_custo_alimentos numeric NOT NULL DEFAULT 0,
  ADD COLUMN custo_fixo_alimentos numeric NOT NULL DEFAULT 0;

ALTER TABLE event_ab_zones
  ADD COLUMN per_capita_custo_bebidas numeric NOT NULL DEFAULT 0,
  ADD COLUMN custo_fixo_bebidas numeric NOT NULL DEFAULT 0,
  ADD COLUMN operador_nome text;

### event-ab-calc.ts — novos campos e dois ramos em computeZone()

Novos campos em ABZoneInput: per_capita_custo_bebidas, custo_fixo_bebidas, operador_nome?
Novos campos em ABFoodConfig: per_capita_custo_alimentos, custo_fixo_alimentos, operador_nome?

Nova assinatura computeTotals():
  function computeTotals(zones, food, modeBebidas, modeAlimentos): ABTotals

computeZone() — Terceirização (actual, sem mudança):
  Faturação = participantes × per_capita_bebidas
  Receita casa = fee_fixo + Faturação × (repasse_pct / 100)
  Custo casa = 0

computeZone() — Exploração Própria (novo):
  participantes = participants_manual ?? fonte_canónica (mesmo denominador para receita e custo)
  Receita casa = participantes × per_capita_bebidas
  Custo casa = participantes × per_capita_custo_bebidas + custo_fixo_bebidas
  Resultado = Receita − Custo (pode ser negativo)

Novos campos em ABTotals:
  custoCasaBebidas: number
  custoCasaAlimentos: number
  custoCasaTotal: number
  custoTotal: number  // @deprecated = custoCasaTotal para backward compat

Ponto crítico: useCitySimulator.ts já lê abModule.totals[scen].custoTotal — sem alteração necessária.

### EventABTab.tsx — UI

Selector de modo por secção (bebidas e alimentos independentes):
  [● Terceirização]  [ Exploração Própria]

Labels condicionais de per_capita_bebidas conforme modo (ver 3.2).
Campos condicionais mostrados/ocultados — valores não apagados ao trocar.
KPIs adaptativos:
  Terceirização → Faturação / Receita casa / Parte gerador / Margem
  Exploração Própria → Receita / Custo / Resultado (verde ≥ 0, vermelho < 0)

### useEventABScenarios.ts
Carregar ab_mode_bebidas e ab_mode_alimentos de event_ab_config e passar para computeTotals().

### Sem alteração em
useCitySimulator.ts, TourSimulator.tsx, testes existentes (defaults preservam comportamento)

---

## 6. SEQUÊNCIA DE IMPLEMENTAÇÃO

1. Migration SQL (2 ALTER TABLE)
2. event-ab-calc.ts — tipos + computeZone() dual + computeTotals() + JSDoc @deprecated
3. Testes — fixtures existentes + 3 casos novos (ver 3.3)
4. EventABTab.tsx — selector modo + labels condicionais + campos condicionais + KPIs adaptativos
5. useEventABScenarios.ts — ler e passar ab_mode_*
6. Após concluir: criar ab-module-dual-mode.md (ver 4.2)
