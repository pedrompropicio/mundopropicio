---
name: MP Operação foundation (Batch 1 v2 + 2A UI)
description: Módulo de gestão operacional (Frentes/Etapas/Registros/Chamados) — DB + UI mobile + escalação push/WhatsApp
type: feature
---

DB-only batch (Batch 1 v2): 8 tabelas em `operacao_*`. Bucket privado `operacao-media`. Role `field_producer` + 6 perms (`view_operacao`, `manage_operacao_frentes`, `manage_operacao_etapas`, `register_operacao`, `open_chamado`, `manage_chamados`). Override: `current_lead_id` da Frente pode editar Etapas sem perm explícita.

SLA via tabela `operacao_chamado_sla` (crit=15/high=60/med=240/low=1440 min). Trigger `trg_operacao_set_sla` preenche `sla_due_at`/`sla_half_at` no INSERT. Cron `operacao-sla-escalator` (2/min) executa RPC `run_operacao_sla_escalator()` que sobe `escalation_level` 0→1→2 e chama `send-push-notification` com `target: frente_team` (lvl 1) ou `target: company_admins` (lvl 2 + WhatsApp se crit/high).

Handover: `current_lead_id` + `lead_handover_until` em `operacao_frentes`. Cron `operacao-handover-restore` (1/min) restaura `is_permanent_lead=true` quando expira.

Campo `events.operacao_mode`: `planning|montagem|evento|post`. Helper `seed_operacao_frentes_default(event_id)` cria 15 Frentes-padrão. Doc: `docs/features/mp-operacao-overview.md`.

**Batch 2A (UI mobile)**: 6 rotas em `/operacao/*`, layout com FAB. Componentes em `src/components/operacao/`: `MediaCapture`, `AudioRecorder`, `RegistroFeed`, `FrenteCard`, `PriorityBadge`, `OperacaoStatusBadge`, `NewEtapaDialog`. Push prompt na primeira visita a `/operacao/equipa`. Edge `send-push-notification` reescrita: aceita `target: {type:'users'|'frente_team'|'company_admins'}` e `whatsapp: boolean` (Twilio gateway, lê `profiles.phone`). `profiles.phone` adicionada. Detalhes em `docs/features/mp-operacao-mobile-flows.md`.

**Patch 2A.1 (repaginar hierarquia visual)**: foco vira "diário de obra" — chamados ficam laterais. `QuickActionFab` substitui FAB único: 4 ações (Frente/Etapa/Registo/Chamado, nesta ordem) com Chamado esmaecido em `planning`/`montagem`. Tabs do `FrenteDetail` reordenam para `Registos | Etapas | Chamados` (Registos default) e tab Chamados esconde-se em planning/montagem sem chamados abertos. `FrenteCard` mostra barra de progresso de etapas + última atividade; contagem de chamados só se relevante. Nova rota `/operacao/atividade` (timeline de Registos kind ≠ chamado, tabs Hoje/Semana/Tudo). `ChamadoDetail` perde a faixa vermelha "vencido há X" — fica linha discreta "Aberto há X · prioridade Y" + botões compactos horizontais. PriorityBadge `large` reduzido. Novo hook `useOperacaoMode(eventId)` + `useCurrentOperacaoMode()`. Componentes novos: `QuickActionFab`, `NewFrenteDialog`, `FrentePickerDialog`, `RegistroSheet` (universal). DB intacto.
