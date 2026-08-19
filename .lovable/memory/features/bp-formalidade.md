---
name: BP Formalidade — Estados de progresso comercial
description: Campo `formalidade` no event_forecasts (5 estados) com merge inteligente em promoção de cenário (Opção C — formalidade vive só na Versão Ativa) e diálogo de confirmação após geração de TX.
type: feature
---

## Estados (enum `bp_formalidade`)
- `estimado` (default) — chute inicial 🔴
- `negociacao` — em cotação com fornecedor 🟠
- `fechado` — contrato/PO assinado, valor blindado 🔵
- `pago_parcial` — TX pagas mas há saldo 🟢 claro
- `pago_total` — 100% liquidado 🟢 escuro

## Regras de transição
- **Sempre manuais** (validação do utilizador). Sugestões aparecem como toast via RPC `suggest_formalidade(_forecast_id)`.
- Tolerância ±5% para sugerir `pago_total`.
- Default ao criar nova linha de BP: `estimado`.

## Auto-sugestão após geração de TX
Quando uma transação é gerada a partir do BP (botão "Gerar Transações" em lote, geração individual via approval cascade ou aprovação em lote), abre-se um diálogo `MarkAsFechadoDialog` perguntando se as linhas afetadas devem passar a `fechado`. Regras:
- Único diálogo no fim da operação (UX confirmado pelo utilizador, não toast com undo nem checkboxes).
- Apenas linhas em `estimado` ou `negociacao` são propostas — estados mais avançados (`fechado`, `pago_parcial`, `pago_total`) ficam intactos.
- Helper `pickFormalidadePromotableIds(items)` em `EventForecast.tsx` filtra os IDs elegíveis.
- Componente reutilizável: `src/components/bp-versions/MarkAsFechadoDialog.tsx`.
- Ligado a 3 mutations no `EventForecast`: `bulkCreateTxMutation`, `approveMutation`, `bulkApproveMutation`.

## Mudança em massa manual
Quando há linhas selecionadas no BP (income ou expense), aparece o botão **Mudar Formalidade (N)** ao lado de Aprovar — abre popover com as 5 opções e aplica a TODAS as selecionadas via `UPDATE … IN (...)` numa só query. O trigger regista cada linha individualmente no log. Componente: `src/components/bp-versions/BulkFormalidadePopover.tsx`. Disponível para utilizadores com `canEditBP`.

## Schema
- `event_forecasts.formalidade` (NOT NULL, default `estimado`)
- `event_forecasts.formalidade_changed_at` (timestamptz)
- `event_forecasts.formalidade_changed_by` (uuid → profiles)
- Trigger `trg_log_formalidade_change` regista cada mudança em `event_forecast_formalidade_log` com `auto_suggested` flag.
- Índice `idx_event_forecasts_formalidade` para filtros.

## Versões / Cenários — Opção C
**Formalidade vive só na Versão Ativa.** Cenários (drafts com `scenario_label`) são fotografias estáticas no `snapshot_payload` — não têm linhas editáveis em `event_forecasts`. A UI deve mostrar formalidade read-only (informativa) em modo cenário.

### Promoção de cenário a Ativa (`promote_scenario_to_active`)
Faz **merge inteligente**:
1. Antes de apagar a Ativa atual, snapshot da formalidade num temp table `_formalidade_carry` (chave: `category_id + description`).
2. Re-insere as linhas do cenário com LEFT JOIN ao carry — se houver match, **reusa o `id` original** (preserva o histórico via FK CASCADE) e mantém `formalidade`/`formalidade_changed_*`.
3. Linhas novas (que não existiam na Ativa) nascem como `estimado`.
4. Linhas removidas pelo cenário deixam de existir (e o respetivo log apaga via CASCADE).

Mesma lógica em cascade para Splits (`_formalidade_carry_split`).

## Overheads / rateios (2026-08-19)
Razão do bloqueio antigo: a RPC `batch_update_event_forecasts` rejeitava qualquer edição em
linhas com `is_overhead`/`exclude_from_result` e a vista Agrupada renderizava-as com `readOnly`,
o que também punha o `FormalidadeBadge` em modo leitura.

Correção: a formalidade é editável nestas linhas nas DUAS vistas, com as permissões normais do BP:
- RPC: overhead/excluded aceita edições cujo payload só tenha `formalidade` (valores continuam read-only).
- Agrupada: `ForecastRow` tem prop `formalidadeEditable` (badge + popover de histórico ativos em overheads).
- Planilha: linhas locked (`isLockedEntry`) ficam read-only excepto a coluna Formalidade; o diff só
  envia `formalidade` e não permite apagá-las.
Nenhum recálculo automático de overhead escreve `formalidade` — o estado escolhido persiste.
