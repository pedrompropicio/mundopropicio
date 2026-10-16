-- #321 — consumidor contínuo de ingestão INTERNA lead_capture -> contacts/leads.
-- Sem net.http_post, sem CAPI. Aplicado em Live a 2026-10-16 via SQL (crons não propagam por Publish).
select cron.schedule('crm-ingest-lead-captures', '*/5 * * * *', $$select public.crm_ingest_lead_captures(100);$$);
-- Reversão (não retoma nada da CAPI):
-- select cron.unschedule('crm-ingest-lead-captures');
