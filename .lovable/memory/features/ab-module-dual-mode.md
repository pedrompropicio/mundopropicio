# A&B Module v2 — Dual Mode (Estado Final)

> **Ficheiro de memória Lovable** — gerado após implementação e revisão.
> Criado: 2026-05-05
> Estado: implementado em main, pendente deploy e teste em ambiente de preview.

---

## O que foi implementado

O módulo de A&B (Alimentos & Bebidas) passou a suportar dois modos de operação distintos,
configuráveis de forma independente para Bebidas e para Alimentos.

---

## Modos de operação

### Terceirização (comportamento original)
O gerador/operador gere os bares e/ou restauração por sua conta.
A casa recebe uma quota: fee fixo (só alimentos) + % das vendas excl. IVA.

Fórmulas:
- Faturação = participantes x per_capita
- Receita casa = Faturação x (% repasse / 100) + fee_alimentos
- Custo casa = 0
- Resultado casa = Receita casa (sempre >= 0)

### Exploração Própria (novo)
O evento gere directamente os seus bares / restauração.
Assume receitas e custos — o resultado pode ser negativo.

Fórmulas:
- Receita casa = participantes x per_capita_bebidas (ou per_capita_alimentos)
- Custo casa = participantes x per_capita_custo + custo_fixo
- Resultado casa = Receita menos Custo (pode ser < 0)

---

## Independência dos modos

Os modos são completamente independentes por tipo:
- ab_mode_bebidas e ab_mode_alimentos são colunas separadas em event_ab_config
- O mesmo evento pode ter terceirização para bebidas e exploração própria para alimentos, ou vice-versa

---

## Colunas de base de dados adicionadas (migration v2)

Tabela event_ab_config:
- ab_mode_bebidas text NOT NULL DEFAULT terceirizacao
- ab_mode_alimentos text NOT NULL DEFAULT terceirizacao
- per_capita_custo_alimentos numeric NOT NULL DEFAULT 0
- custo_fixo_alimentos numeric NOT NULL DEFAULT 0

Tabela event_ab_zones:
- per_capita_custo_bebidas numeric NOT NULL DEFAULT 0
- custo_fixo_bebidas numeric NOT NULL DEFAULT 0
- operador_nome text (nullable, sem FK em v1)

Migration: 20260505162358_ab-module-v2-dual-mode.sql

---

## Regras de design

### Labels contextuais na UI
O campo per_capita_bebidas tem label diferente conforme o modo:
- Terceirização: "Per capita faturação (operador)"
- Exploração Própria: "Per capita receita (casa)"

### Não limpar campos ao trocar de modo
Quando o utilizador troca de modo, os campos ficam ocultos mas NÃO são apagados do DB.
Isto permite alternar entre modos sem perda de dados.

### participants_manual como denominador unificado
Em exploração própria, o override de participantes manuais é usado como denominador
tanto para receita como para custo. O mesmo número é sempre o denominador de ambos.

### Exploração própria open_bar
Zonas marcadas como open_bar = true retornam receita, custo e resultado todos a 0,
independentemente do modo configurado.

### Custo fixo sem participantes
Com participantes = 0 e custo_fixo > 0:
resultado = 0 menos custo_fixo (negativo puro de custo fixo)

---

## Compatibilidade legado

Os seguintes campos foram mantidos com @deprecated para não quebrar código existente:

Em ABTotals:
- custoTotal: mantido igual a custoCasaTotal
- custoBebidas: mantido a 0 (valor real em custoCasaBebidas)
- custoAlimentos: mantido a 0 (valor real em custoCasaAlimentos)

Em ABZoneResult:
- custoBebidas: mantido a 0 (deprecated alias)

---

## Ficheiros modificados

| Ficheiro | Alteração |
|----------|-----------|
| supabase/migrations/20260505162358_ab-module-v2-dual-mode.sql | Migration não-destrutiva |
| src/lib/event-ab-calc.ts | computeZone e computeTotals com suporte dual mode |
| src/lib/__tests__/event-ab-fixtures.ts | Fixtures actualizadas + 3 novos casos |
| src/lib/__tests__/event-ab-calc.test.ts | Testes actualizados incluindo negativo, misto, custo fixo puro |
| src/hooks/useEventABScenarios.ts | Hook actualizado com modeBebidas e modeAlimentos |
| src/components/EventABTab.tsx | UI com ModeSelector, labels contextuais, KpisConsolidados adaptativo |

---

## TODO v2 (fora de scope da implementação actual)

- auto_sync_bp em exploração própria: quando modo = exploracao_propria, sincronizar
  automaticamente o cenário Break Even com base no custo fixo dividido pela margem unitária.
  Documentado como TODO no código de useEventABScenarios.ts.

- Tabela event_ab_food_operators (FK): para relatórios cross-event por operador,
  criar tabela separada com FK para operators e para eventos.

- Múltiplos operadores por zona: actualmente operador_nome é texto livre (v1).
  Em v2, suportar N operadores distintos por zona/tipo com percentagens independentes.

---

## Testes obrigatórios antes de produção

Ver ficheiro: .lovable/memory/features/ab-module-v2-test-guide.md

Cenários críticos:
- T1: regressão terceirização pura
- T5: resultado negativo (KPI vermelho)
- T6: troca de modo sem perda de dados
- T7: participants_manual como denominador unificado
