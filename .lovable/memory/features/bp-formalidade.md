---
name: BP Formalidade — Estados de progresso comercial
description: Campo `formalidade` no event_forecasts (5 estados) com merge inteligente em promoção de cenário (Opção C — formalidade vive só na Versão Ativa).
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
