# Guia de Teste — A&B Module v2 (Dual Mode)

> **Contexto:** Implementação do suporte a dois modos de operação de A&B (Alimentos & Bebidas)
> por tipo (bebidas/alimentos), independentes.
> Branch: main - Migration: 20260505162358_ab-module-v2-dual-mode.sql

---

## 1. Pré-requisitos

Antes de iniciar o teste funcional, aplicar a migration na instância Supabase.

A migration adiciona as seguintes colunas:

Em event_ab_config:
- ab_mode_bebidas text DEFAULT terceirizacao (CHECK terceirizacao ou exploracao_propria)
- ab_mode_alimentos text DEFAULT terceirizacao (CHECK terceirizacao ou exploracao_propria)
- per_capita_custo_alimentos numeric DEFAULT 0
- custo_fixo_alimentos numeric DEFAULT 0

Em event_ab_zones:
- per_capita_custo_bebidas numeric DEFAULT 0
- custo_fixo_bebidas numeric DEFAULT 0
- operador_nome text (nullable)

**Verificação pós-migration:**
- Todos os eventos existentes continuam a funcionar (modo padrão = terceirizacao)
- Nenhum registo existente foi alterado (migration não-destrutiva)
- Schema Supabase mostra as 7 colunas novas

---

## 2. Mapa de Cenários de Teste

| ID | Cenário | Bebidas | Alimentos | Resultado esperado |
|----|---------|---------|-----------|-------------------|
| T1 | Terceirização pura | terceirizacao | terceirizacao | comportamento original preservado |
| T2 | Exploração própria bebidas | exploracao_propria | terceirizacao | custo bebidas diferente de 0 |
| T3 | Exploração própria alimentos | terceirizacao | exploracao_propria | custo alimentos diferente de 0 |
| T4 | Exploração própria ambos | exploracao_propria | exploracao_propria | resultado total pode ser negativo |
| T5 | Resultado negativo (bebidas) | exploracao_propria | terceirizacao | KPI Resultado vermelho |
| T6 | Troca de modo sem perda de dados | qualquer para outro | qualquer | campos mantidos no DB |
| T7 | participants_manual | exploracao_propria | exploracao_propria | override para receita E custo |
| T8 | Open bar + exploração própria | exploracao_propria | — | zona open_bar retorna tudo a 0 |
| T9 | Custo fixo sem participantes | exploracao_propria | — | resultado = menos custo_fixo |

---

## 3. Instruções de Teste Detalhadas

### T1 — Terceirização Pura (regressão obrigatória)

**Objetivo:** Garantir que o comportamento original não foi quebrado.

1. Abrir um evento existente → separador A&B
2. Confirmar que o selector de modo mostra "Terceirização" em Bebidas e Alimentos
3. Verificar que os campos existentes estão preenchidos (per capita, % repasse, fee)
4. Confirmar os KPIs:
   - Faturação = soma de (participantes x per_capita) por zona
   - Receita Casa = Faturação x (% repasse / 100) + fee alimentos
   - Custo Casa = 0
   - Margem % = Receita / Faturação x 100
5. Os 3 cenários (Real / Break Even / Forecast) variam apenas o nº de participantes

Resultado esperado: resultados idênticos aos anteriores à migration.

---

### T2 — Exploração Própria Bebidas

**Setup:**
- Bebidas: mudar para "Exploração Própria"
- Alimentos: manter "Terceirização"

**Campos que devem aparecer em Bebidas (por zona):**
- Per capita receita (casa) — label contextual, antes dizia "Per capita faturação"
- Per capita custo (casa) — novo campo
- Custo fixo da zona — novo campo
- Nome do operador — campo opcional

**Verificar cálculo por zona:**

receita = participantes x per_capita_bebidas
custo = participantes x per_capita_custo_bebidas + custo_fixo_bebidas
resultado = receita menos custo

**KPIs esperados em Bebidas:**
- Receita Casa = receita total das zonas
- Custo Casa = custo total das zonas
- Resultado = Receita menos Custo (negativo mostra em vermelho)

**Verificar:** campos de Terceirização (% repasse) ficam ocultos mas NÃO apagados do DB.

---

### T3 — Exploração Própria Alimentos

**Setup:**
- Bebidas: manter "Terceirização"
- Alimentos: mudar para "Exploração Própria"

**Campos que devem aparecer em Alimentos:**
- Per capita receita alimentos — label contextual
- Per capita custo alimentos — novo campo
- Custo fixo alimentos — novo campo
- Nome do operador alimentos — opcional

**Verificar cálculo:**

participantes_elegíveis = soma de participantes das zonas onde open_food = false
receita_alimentos = participantes_elegíveis x per_capita_alimentos
custo_alimentos = participantes_elegíveis x per_capita_custo_alimentos + custo_fixo_alimentos
resultado_alimentos = receita_alimentos menos custo_alimentos

---

### T4 — Exploração Própria em Ambos

**Setup:** Ambos os tipos em Exploração Própria.

**KPIs Consolidados esperados:**

faturacaoTotal = faturacaoBebidas + faturacaoAlimentos
receitaTotal = receitaBebidas + receitaAlimentos
custoCasaTotal = custoCasaBebidas + custoCasaAlimentos
resultadoTotal = receitaTotal menos custoCasaTotal (pode ser negativo)
margemPct = receitaTotal / faturacaoTotal x 100

**Confirmar:** custoTotal (deprecated) é igual a custoCasaTotal em todos os cenários.

---

### T5 — Resultado Negativo (caso crítico)

**Setup:**
- Bebidas: Exploração Própria
- Zona com: per_capita_receita = 5 EUR, per_capita_custo = 8 EUR, custo_fixo = 500 EUR
- Participantes = 100

**Cálculo esperado:**

receita = 100 x 5 = 500 EUR
custo = 100 x 8 + 500 = 1300 EUR
resultado = 500 menos 1300 = MENOS 800 EUR (negativo)

**Verificar na UI:**
- KPI "Resultado" mostra -800 EUR
- KPI exibido em VERMELHO (não verde)
- Sem erros de consola ou crash

---

### T6 — Troca de Modo Sem Perda de Dados

**Objetivo:** Confirmar que trocar o modo na UI não apaga os campos do DB.

**Procedimento:**
1. Configurar Bebidas em Exploração Própria com per_capita_custo = 3.50 EUR e custo_fixo = 200 EUR
2. Guardar
3. Trocar para Terceirização → preencher % repasse = 20%
4. Guardar
5. Trocar de volta para Exploração Própria
6. Verificar: per_capita_custo e custo_fixo ainda estão com 3.50 EUR e 200 EUR

Resultado esperado: os campos de cada modo persistem no DB, apenas ficam ocultos na UI.

---

### T7 — participants_manual (denominador unificado)

**Objetivo:** Confirmar que o override manual de participantes afecta receita E custo igualmente.

**Setup:**
- Bebidas: Exploração Própria
- participants_manual = 500 (em vez do valor calculado da zona)
- per_capita_bebidas = 10 EUR, per_capita_custo_bebidas = 6 EUR, custo_fixo = 0

**Cálculo esperado:**

receita = 500 x 10 = 5000 EUR
custo = 500 x 6 = 3000 EUR
resultado = 2000 EUR

**Verificar:** o mesmo participants_manual é usado para receita e para custo — mesmo denominador.

---

### T8 — Open Bar + Exploração Própria

**Setup:**
- Zona marcada como open_bar = true
- Bebidas: Exploração Própria

**Esperado:**
- Zona retorna faturação = 0, receita = 0, custo = 0, resultado = 0
- Sem erros de divisão ou NaN na UI

---

### T9 — Custo Fixo Sem Participantes

**Setup:**
- Bebidas: Exploração Própria
- Zona com participants = 0
- per_capita_custo_bebidas = qualquer valor
- custo_fixo_bebidas = 300 EUR

**Cálculo esperado:**

receita = 0 x per_capita = 0 EUR
custo = 0 x per_capita_custo + 300 = 300 EUR
resultado = 0 menos 300 = MENOS 300 EUR

Este é o cenário de custo fixo puro — resultado = menos custo_fixo.

---

## 4. Verificações de Labels na UI

| Campo DB | Label em Terceirização | Label em Exploração Própria |
|----------|----------------------|-----------------------------|
| per_capita_bebidas | Per capita faturação (operador) | Per capita receita (casa) |
| per_capita_alimentos | Per capita faturação (operador) | Per capita receita (casa) |

Confirmar que a label muda ao trocar de modo SEM recarregar a página.

---

## 5. KPIs por Modo — Referência Rápida

### Bebidas em Terceirização
- Faturação = soma(participantes x per_capita)
- Receita Casa = Faturação x % repasse
- Custo Casa = 0
- Margem % = Receita / Faturação x 100

### Bebidas em Exploração Própria
- Receita Casa = soma(participantes x per_capita_bebidas)
- Custo Casa = soma(participantes x per_capita_custo + custo_fixo)
- Resultado = Receita menos Custo (vermelho se negativo)

### Alimentos em Terceirização
- Faturação = participantes_elegíveis x per_capita_alimentos
- Receita Casa = Faturação x % repasse + fee_alimentos
- Custo Casa = 0

### Alimentos em Exploração Própria
- Receita Casa = participantes_elegíveis x per_capita_alimentos
- Custo Casa = participantes_elegíveis x per_capita_custo_alimentos + custo_fixo_alimentos
- Resultado = Receita menos Custo

---

## 6. Checklist de Compatibilidade Legado

- custoTotal (deprecated) deve ser igual a custoCasaTotal em todos os cenários
- custoBebidas (deprecated) deve ser 0 (valor real está em custoCasaBebidas)
- custoAlimentos (deprecated) deve ser 0 (valor real está em custoCasaAlimentos)
- Eventos criados antes da migration funcionam sem alteração
- Nenhum campo existente foi removido ou renomeado

---

## 7. TODO — Fora de Scope deste Teste (v2)

- auto_sync_bp em exploração própria: sincronizar Breakeven automaticamente
- Tabela event_ab_food_operators com FK para relatórios cross-event por operador
- Múltiplos operadores por zona com percentagens independentes
