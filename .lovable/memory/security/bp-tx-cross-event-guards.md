---
name: Guardas BP↔TX cross-event
description: Vínculo event_forecasts.transaction_id não pode atravessar eventos/empresas; auto-desvínculo ao mudar de evento; guarda nos triggers de rubrica; auditoria de Evento/Descrição
type: feature
---

Incidente (2026-08): TX criada a partir de uma linha do BP da Anitta foi movida para
o Ivete Clareou 2026; o `transaction_id` apodreceu e os triggers de rubrica podiam
reclassificar a contabilidade de um evento a partir do BP de outro.

Regra canónica: `public.bp_tx_link_allowed(tx_event, tx_company, fc_event, fc_company)`
- empresas diferentes → recusa sempre;
- `tx.event_id IS NULL` → aceita (desenho master/subeventos, ver `bp-tx-matching.ts`);
- mesmo evento → aceita;
- relação `events.parent_event_id` em qualquer direcção → aceita;
- resto → recusa.

Implementação:
- `trg_enforce_forecast_tx_same_event` (BEFORE INSERT/UPDATE OF transaction_id em
  `event_forecasts`) — `RAISE EXCEPTION` pt-PT nomeando os dois eventos. Sai cedo com
  `transaction_id NULL`, sem mudança real, ou em snapshots (`version_id IS NOT NULL`).
- `trg_unlink_forecasts_on_tx_event_change` (AFTER UPDATE OF event_id em `transactions`)
  — desvincula as linhas vivas que deixariam de satisfazer a regra e grava
  `system_audit_log.action = 'auto_unlink_forecast_tx_event_change'` (metadata:
  forecast_id, old/new_event_id). Mover TX entre eventos NUNCA é bloqueado.
- `sync_tx_category_from_forecast` / `realign_tx_category_from_forecast` — guarda de
  evento antes de escrever; se falhar, não propaga e grava
  `action = 'blocked_cross_event_category_sync'`.
- `update-transaction` edge fn — audita SEMPRE, derivado no servidor, "Evento" e
  "Descrição" em `transaction_audit_log` (antes dependia do payload do cliente).

Vínculos legados com `tx.event_id IS NULL` (12: Mágicos Henry&Klaus + Turnê Simone
Mendes) continuam válidos por desenho — não apertar.
