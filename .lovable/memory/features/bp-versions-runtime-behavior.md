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
| `null` | Versão Ativa (produção) | ✅ Sim, via `transactions.forecast_id` |
| `uuid` de cenário | Sandbox isolado | ❌ Não — snapshot estático |

O vínculo canónico é **`transactions.forecast_id`** (N transações : 1 linha). `event_forecasts.transaction_id` é apenas a **âncora** (a primeira TX vinculada), reconstruída pelo trigger `trg_sync_tx_forecast_to_anchor` — nunca a escrever à mão.

`create_bp_snapshot` clona TODOS os forecasts ativos para novas linhas com `version_id = <novo_cenário>`. Editar o cenário não toca a Ativa, e vice-versa.

### Reescrever o BP não pode perder vínculos
A FK `transactions_forecast_id_fkey` é `ON DELETE SET NULL`: qualquer `DELETE FROM event_forecasts ... version_id IS NULL` limpa em silêncio o `forecast_id` das transações do evento, e reinserir a linha com o mesmo id **não** o restaura. Por isso `promote_scenario_draft_to_active`, `promote_scenario_to_active` e `_revert_event_to_version` chamam `bp_capture_tx_links(event_id)` **antes** do DELETE e `bp_restore_tx_links(event_id, links)` depois de as linhas novas estarem vivas — no Master e em cada Split. A reposição faz-se pelo mesmo id e, quando o id não sobreviveu, por `(category_id, description)` e **só** quando existe exactamente uma linha viva candidata. O resultado (`relinked`, `by_id`, `by_description`, `ambiguous`, `unmatched`) fica no `metadata.tx_links` do registo em `bp_version_audit_log`.

`bp_version_linked_tx_count(event_id)` — a trava da reversão — conta os vínculos reais (`transactions` JOIN `event_forecasts` por `forecast_id`), não a âncora.


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

## Nota 08/09/2026 — cenários em `working_draft` (funções não documentadas)

Além do circuito `create_bp_snapshot` / `promote_scenario_to_active`, existe na base um circuito paralelo de **rascunho de cenário** em estado `working_draft`:

- **`create_scenario_draft(_event_id, _scenario_label, _scenario_assumptions, _description)`** — exige admin/manager/editor, sobe ao Master se lhe passarem um Split, cria a versão `working_draft` e **clona as linhas Ativas** para o cenário; cascade automático para cada Split via `cascaded_from_version_id`. Devolve o id da versão.
- **`discard_scenario_draft(_version_id)`** — só aceita `working_draft`; apaga as versões cascateadas dos Splits e a do Master (as linhas caem por FK), deixando registo em `bp_version_audit_log`.
- **`promote_scenario_draft_to_active(_scenario_version_id, _new_active_label, _new_active_description)`** — só admin/manager. Não cria versão nova: passa a Ativa atual a `superseded`, promove o próprio `working_draft` a `active`, apaga as linhas Ativas e faz `version_id = NULL` nas do cenário — logo **as linhas ficam com ids novos** e a reposição de vínculos dá-se quase toda por `(category_id, description)`. Cascade a cada Split.
