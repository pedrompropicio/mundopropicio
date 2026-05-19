---
name: MP Operação foundation (Batch 1 v2)
description: Módulo de gestão operacional (Frentes/Etapas/Registros/Chamados) — DB foundation, RLS, SLA escalator, role field_producer
type: feature
---

DB-only batch (sem UI). 8 tabelas em `operacao_*` (frentes, frente_team, etapas, registros, registro_media, mentions, chamado_sla, daily_reports). Bucket privado `operacao-media`. Novo role `field_producer` + 6 perms (`view_operacao`, `manage_operacao_frentes`, `manage_operacao_etapas`, `register_operacao`, `open_chamado`, `manage_chamados`). Override: `current_lead_id` da Frente pode editar Etapas sem perm explícita.

SLA via tabela `operacao_chamado_sla` (crit=15/high=60/med=240/low=1440 min). Trigger `trg_operacao_set_sla` preenche `sla_due_at`/`sla_half_at` no INSERT. Cron `operacao-sla-escalator` (2/min) sobe `escalation_level` 0→1→2 e chama `send-push-notification`; whatsapp para crit/high no nível 2.

Handover: `current_lead_id` + `lead_handover_until` em `operacao_frentes`. Cron `operacao-handover-restore` (1/min) restaura `is_permanent_lead=true` quando expira. Trigger `trg_op_team_lead_sync` sincroniza permanent_lead → current_lead_id quando sem handover.

Campo `events.operacao_mode`: `planning|montagem|evento|post`. Helper `seed_operacao_frentes_default(event_id)` cria 15 Frentes-padrão. Doc: `docs/features/mp-operacao-overview.md`.
