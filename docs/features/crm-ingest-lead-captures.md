# Ingestão interna lead_capture → contactos (#321, D-ERP282)

- Função `public.crm_ingest_lead_captures(p_batch_size, p_only_ids)` — SECURITY DEFINER, só `service_role`. Migração `drizzle/migrations/0166_issue321_crm_ingest_lead_captures.sql`.
- Cron `crm-ingest-lead-captures` (`*/5 * * * *`, jobid 2398), SQL puro. Registo/reversão: `supabase/manual/cron_crm_ingest_lead_captures_live.sql`.
- Âmbito: MP (`portal, vip_event_page, sticky_cta, notify_me, hero_vip, newsletter_homepage, vip_hero_coupon_chip`) e Coala (`coala_hero_email, coala_early_bird, coala_early_bird_invite, notify_me`). Resto: `processed=false` + `processing_error 'quarantine#321: …'`.
- Identidade: email/telefone na empresa; email e telefone em contactos diferentes → quarentena. Nunca funde nem apaga.
- Contacto existente: só preenche email/telefone/nome vazios e `last_activity_at`. Novo: consentimento da captura, datado em `created_at` da captura.
- Lead novo: `meta.lead_capture_id` (idempotência), `created_at` original, `capi_status='blocked_no_consent'` → nunca seleccionado pela fila CAPI.
- `coala_early_bird_invite`: contacto sim, lead não.
- `clube_newgang` excluído: `trg_club_from_lead_capture` envia email ao marcar `processed`. Proposta em `docs/testes/issue321/01-baseline-e-prova-live.md`.
- Clube manual: `crm_ingest_clube_captures_by_ids(p_ids)` (0167), só por IDs explícitos autorizados; dispara o fluxo normal do Clube (membro + confirmação, dedupe por email_send_log). Não há retoma contínua do Clube.
- Não substitui `process_lead_captures_batch` (mantida, suspensa). `redirect_log` fora (tráfego).
- Teste: `supabase/tests/crm_ingest_lead_captures.sql` (revertido) + `src/test/crm-ingest-no-network.test.ts`.
