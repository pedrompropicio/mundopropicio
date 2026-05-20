---
name: WhatsApp Notifications (Fase 1 — MVP Grupo A)
description: Infraestrutura Meta WhatsApp Cloud API para notificações operacionais
type: feature
---

Pipeline: triggers DB → `enqueue_whatsapp_notification` (RPC SECDEF) → tabela `notification_queue` (status='queued') → cron 1/min chama edge `whatsapp-dispatcher` → POST `graph.facebook.com/v21.0/{PHONE_ID}/messages` → status=sent + `meta_message_id`. Edge `whatsapp-webhook` recebe statuses (delivered/read/failed) e deteta opt-out por palavras-chave PARAR/STOP/SAIR/CANCELAR. Tabela `notification_log` audita tudo.

Templates Grupo A (4, status=pending até aprovação Meta): `equipe_atribuicao_evento`, `lead_atribuido_zona_servico`, `etapa_status_alterado`, `fase_evento_avancou`. Helper RPC só enfileira se template='approved' E user tem opt-in ativo. Categoria UTILITY. Idioma `pt_PT`.

Tabelas: `notification_templates`, `notification_optin` (UNIQUE profile_id), `notification_queue` (RLS por company), `notification_log` (RLS via queue). Coluna `profiles.whatsapp_phone` (separada de `profiles.phone` operacional).

Secrets necessários (Lovable Cloud): `META_WA_PHONE_NUMBER_ID`, `META_WA_SYSTEM_TOKEN`, `META_WA_WABA_ID`, `META_WA_APP_ID`, `META_WA_WEBHOOK_VERIFY_TOKEN`.

UI: `/admin/notifications` (Templates · Fila · Opt-in, só admin/platform_admin) e `/perfil` (opt-in self-service, validação E.164). Brasil entra em fase futura com mesma estrutura. Twilio (`_shared/twilio.ts`) é independente — continua para staff invites/system reminders.
