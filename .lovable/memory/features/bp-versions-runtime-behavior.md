---
name: BP Versions — comportamento em runtime (BP, transações, relatórios)
description: Como `event_forecasts.version_id` distingue Ativa vs Sandbox, regras que se aplicam a transações reais, validação de bypass, cascade Master→Splits, promoção e quais relatórios respeitam cenário.
type: feature
---

## Modelo de versões (recap)

Cada evento tem **uma única versão `active`** por força do índice único parcial `idx_bp_versions_one_active_per_event`. Restantes estados:
- `draft` sem `scenario_label` → rascunho normal de trabalho.
- `draft` com `scenario_label` → **cenário sandbox** (paralelo, não-produtivo).
- `approved` / `archived` / `superseded` → histórico.

## `event_forecasts.version_id` — regra de oiro

| `version_id` | Significado | Vê transações reais? |
|---|---|---|
| `null` | Versão Ativa (produção) | ✅ Sim, via `transaction_id` |
| `uuid` de cenário | Sandbox isolado | ❌ Não — snapshot estático |

`create_bp_snapshot` clona TODOS os forecasts ativos para novas linhas com `version_id = <novo_cenário>`. Editar o cenário não toca a Ativa, e vice-versa.

## Transações vivem SEMPRE na Ativa

**Nunca são clonadas para cenários.** Consequências:

- **Aba BP em modo cenário**: mostra forecasts do cenário; "Gerar transação" e link `transaction_id` ficam desativados/escondidos (não faz sentido criar TX num sandbox).
- **Validação de bypass (BP ativo restritivo)**: aplica-se SÓ à Versão Ativa. Lançar uma despesa real continua a comparar com o BP em produção, ignorando cenários — caso contrário um cenário "permissivo" abriria porta lateral.
- **Cascade Master→Splits**: criar/promover cenário no Master cascateia cenários "irmãos" para os Splits via `cascaded_from_version_id`. Forecasts cascateados também ficam isolados.

## Promoção de cenário (`promote_scenario_to_active`)

Atómico:
1. Demote a Ativa atual para `superseded`.
2. Promove o cenário escolhido a `active`.
3. Reescreve `event_forecasts` da Ativa com as linhas do cenário.
4. Reconcilia bypasses: TX que estavam "fora do BP" podem voltar a casar.
5. Cascade automático para Splits que tinham cenário equivalente.
6. Bloqueia se houver TX vinculadas que perderiam vínculo (override com `_force=true`).

## Comportamento em relatórios

| Relatório | Seletor de cenário? | Comportamento |
|---|---|---|
| Business Plan (PL) | ✅ | Substitui forecasts da Ativa pelos do cenário no evento selecionado |
| BP x Transações | ✅ | Idem — mas transações continuam sempre as reais |
| DRE / DRE Brasil / DRE Empresarial | ❌ | Sempre Ativa — relatório de realizado contábil |
| Rentabilidade, Evolução, Desvio Orçamento | ❌ | Sempre Ativa — análise de performance real |
| Bilheteira (PDF) | ✅ | Estrutura do cenário (sessões/zonas/lotes), sem vendas reais |

Seletor só aparece quando: 1 evento filtrado **e** existem cenários **fixados** (`is_pinned_scenario`).

### Ponto subtil em "BP x Transações" com cenário
Compara **planeado do cenário** vs **transações reais (Ativa)**. Útil para "se o pessimista fosse o oficial, qual seria o desvio hoje?". O desvio não é simétrico ao da Ativa.

## Regras de proteção em runtime

- `SalesLogPanel` bloqueado em modo cenário (vendas reais só na Ativa).
- Eventos `completed` desbloqueiam edição em modo cenário (sandbox isolado da produção).
- Limite de **4 cenários fixados por evento** (validado client + RPC).
- Promoção bloqueada se TX já vinculadas (override `_force=true`).
- `ReportScenarioSelector` esconde-se em multi-evento (`isMultiEvent=true`) ou sem cenários fixados.

## Nota 06/08/2026
A vista **Planilha** do BP passou a ser Handsontable (`BPPlanilha.tsx`); o Univer foi aposentado.
