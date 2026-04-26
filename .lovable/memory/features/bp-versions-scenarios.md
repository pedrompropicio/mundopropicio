---
name: BP Versions — Cenários múltiplos
description: Modelo e UI dos cenários paralelos do Business Plan (rascunhos nomeados com pressupostos estruturados, fixação até 4, promoção a versão ativa).
type: feature
---

## Modelo
Cenários são versões em estado `draft` com `bp_versions.scenario_label` preenchido. Não substituem a versão ativa — vivem em paralelo para análise comparativa. Campos:
- `scenario_label` (text) — nome curto ("Pessimista 12k").
- `scenario_assumptions` (jsonb) — `{ publico_estimado, ticket_medio, ocupacao_pct, notas }`.
- `is_pinned_scenario` (bool) — fixados aparecem na multi-comparação. Limite: **4 fixados por evento** (validação no client + RPC).

## RPCs
- `create_bp_snapshot(..., _scenario_label, _scenario_assumptions, _is_pinned_scenario)` — cria cenário em draft com cascade para Splits (em Master).
- `promote_scenario_to_active(_scenario_version_id, _description, _performed_by, _performed_by_label, _force, _other_scenarios_actions)` — promove cenário a versão ativa, faz cascade para Splits (procura split com `cascaded_from_version_id = _scenario_version_id`), reescreve `event_forecasts` e reconcilia bypasses. Bloqueia se houver TX vinculadas (override com `_force`). `_other_scenarios_actions` é um jsonb array `[{ version_id, action: 'keep' | 'archive' | 'discard' }]` que decide o destino dos outros cenários vivos do mesmo evento.
- `list_bp_versions(_event_id)` — devolve agora também `scenario_assumptions` (jsonb) para renderização de chips.

⚠️ Cuidado com sobrecargas: garante que só existe a assinatura de 6 args. Se aparecer ambiguidade PGRST203, faz `DROP FUNCTION promote_scenario_to_active(uuid, text, uuid, text);` (assinatura antiga).

## UI
- `FreezeBPVersionModal` — radio com 3 modos: **Rascunho**, **Aprovar imediatamente**, **Cenário** (com inputs estruturados + toggle de fixação).
- `BPVersionsHistoryModal` — timeline agrupada em **"Versões oficiais"** vs **"Cenários de trabalho"**. Cada cenário mostra:
  - Badge `[Sparkles] {label}` + badge `[Pin] Fixado` (se aplicável)
  - Chips de pressupostos: `Público: 12 000 · Ticket: €35.00 · Ocupação: 60%` + nota itálica
  - Botões: Promover (Rocket), Fixar/Desafixar (Pin/PinOff, respeitando limite 4), Arquivar, Descartar
- `BPVersionsCompareModal` — usa cenários fixados como referência rápida (ver doc separada se existir).

## Invariante crítico
O índice único parcial `idx_bp_versions_one_active_per_event` exige no máximo uma versão ativa por evento. Todas as funções que criam novo `active` (snapshot, promote, revert) **demote a anterior PRIMEIRO**, depois inserem.

## Cascade Master→Splits em promoção
Ao promover um cenário do Master, cada Split tem o seu próprio cenário cascado (criado no momento do `create_bp_snapshot` original). A promoção identifica esse split-cenário via `cascaded_from_version_id = _scenario_version_id` e promove-o sincronamente. Splits sem cenário equivalente são ignorados (não-fatal).
