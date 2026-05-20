# Database — Referência rápida

> Documento conciso. Para detalhe completo, ver `supabase/migrations/` e tipos em `src/integrations/supabase/types.ts`.

## Notificações WhatsApp (Fase 1)

Infra MVP para notificações operacionais via WhatsApp Cloud API (Meta).

### Tabelas

| Tabela | Propósito |
|---|---|
| `notification_templates` | Catálogo de templates Meta (nome, idioma, body, `param_count`, `status`). |
| `notification_optin` | Opt-in/out por utilizador. `profile_id`, `phone_number` (E.164), `opted_in_at`, `opted_out_at`. |
| `notification_queue` | Fila de envio. Inclui `template_name`, `to_phone`, `payload` (params), `status`, `retry_count`, `scheduled_for`. |
| `notification_log` | Auditoria de entrega: `sent`/`delivered`/`read`/`failed` recebidos via webhook Meta. |

### Coluna adicional

- `profiles.whatsapp_phone` (text, E.164) — telefone WhatsApp do utilizador (espelha o opt-in para queries rápidas).

### Triggers (auto-enqueue)

- `notify_team_member_added` em `event_team_members`
- `notify_lead_assigned` em `operacao_frentes`
- `notify_etapa_status_changed` em `operacao_etapas`
- `notify_event_phase_changed` em `events`

Todos chamam `enqueue_whatsapp_notification(...)` que valida template aprovado + opt-in activo.

### Cron

- `whatsapp_dispatcher_minute` — `* * * * *` — invoca edge function `whatsapp-dispatcher` (batch 50, retry máx 3). Auth via `email_queue_service_role_key` no vault.
