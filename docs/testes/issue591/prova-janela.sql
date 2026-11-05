-- #591 — prova de janela preparada, NÃO EXECUTADA nesta tarefa.
-- Executar pelo 0 com Sim, antes/depois dos bytes da 0313 pelo PROC-promocao.
-- Apenas SELECT e contexto transacional descartável; sem DDL/DML.
-- Guardar ambos os resultados. EXCEPT não vazio exige reconciliação antes da aplicação.
-- Não versionar IDs reais; substituir os placeholders só na sessão autorizada.

-- §1 — Referências em qual/with_check, incluindo o novo sufixo _or_platform.
-- Esperado antes/depois: public=93 (79 tabelas), storage=2 (objects).
SELECT schemaname, count(*) AS politicas, count(DISTINCT tablename) AS tabelas
FROM pg_policies
WHERE qual ILIKE '%row_belongs_to_current_company%'
   OR with_check ILIKE '%row_belongs_to_current_company%'
GROUP BY schemaname ORDER BY schemaname;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE qual ILIKE '%row_belongs_to_current_company%'
   OR with_check ILIKE '%row_belongs_to_current_company%'
ORDER BY schemaname, tablename, policyname;

WITH esperado(schemaname, tablename, policyname) AS (VALUES
  ('public', 'accountant_transaction_reviews', 'company_isolation_accountant_transaction_reviews'),
  ('public', 'audience_members', 'audience_members_company_isolation'),
  ('public', 'audience_snapshots', 'audience_snapshots_company_isolation'),
  ('public', 'audiences', 'audiences_company_isolation'),
  ('public', 'backup_runs', 'company_isolation_backup_runs'),
  ('public', 'card_integrations', 'card_integrations_company_isolation'),
  ('public', 'card_item_documents', 'card_item_documents_company_isolation'),
  ('public', 'card_session_items', 'card_session_items_company_isolation'),
  ('public', 'card_session_loads', 'card_session_loads_company_isolation'),
  ('public', 'card_sessions', 'card_sessions_company_isolation'),
  ('public', 'club_attendance_claims', 'company_isolation_club_attendance_claims'),
  ('public', 'club_crew_members', 'company_isolation_club_crew_members'),
  ('public', 'club_crews', 'company_isolation_club_crews'),
  ('public', 'club_guesses', 'company_isolation_club_guesses'),
  ('public', 'club_legacy_consumption', 'club_legacy_consumption_select_staff'),
  ('public', 'club_level_floors', 'club_level_floors_select_staff'),
  ('public', 'club_levels', 'company_isolation_club_levels'),
  ('public', 'club_member_profiles', 'member_profile_staff'),
  ('public', 'club_members', 'company_isolation_club_members'),
  ('public', 'club_mission_submissions', 'company_isolation_club_mission_submissions'),
  ('public', 'club_missions', 'company_isolation_club_missions'),
  ('public', 'club_point_rules', 'company_isolation_club_point_rules'),
  ('public', 'club_points', 'company_isolation_club_points'),
  ('public', 'club_points_config', 'club_points_config_select_staff'),
  ('public', 'club_points_cutover_log', 'club_points_cutover_log_select_staff'),
  ('public', 'club_profile_settings', 'profile_settings_staff'),
  ('public', 'club_purchase_evidence', 'club_purchase_evidence_select_staff'),
  ('public', 'club_referral_events', 'club_referral_events_select_staff'),
  ('public', 'club_rewards', 'company_isolation_club_rewards'),
  ('public', 'club_terms', 'company_isolation_club_terms'),
  ('public', 'club_wallet_passes', 'company_isolation_club_wallet_passes'),
  ('public', 'coala_invites', 'coala_invites_read'),
  ('public', 'coala_list_consents', 'coala_list_consents_read'),
  ('public', 'coala_send_runs', 'coala_send_runs_read'),
  ('public', 'communication_log', 'communication_log_company_isolation'),
  ('public', 'consent_log', 'consent_log_select_admin'),
  ('public', 'consent_text_versions', 'consent_text_versions_read'),
  ('public', 'contacts', 'company_isolation_contacts'),
  ('public', 'document_download_audit', 'dda_select_admin_manager'),
  ('public', 'email_campaigns', 'email_campaigns_company_isolation'),
  ('public', 'email_send_log', 'company_isolation_email_send_log'),
  ('public', 'email_send_state', 'company_isolation_email_send_state'),
  ('public', 'email_unsubscribe_tokens', 'company_isolation_email_unsubscribe_tokens'),
  ('public', 'entity_documents', 'company_isolation_entity_documents'),
  ('public', 'event_coverage_scenario_log', 'company_isolation_event_coverage_scenario_log'),
  ('public', 'event_coverage_scenarios', 'company_isolation_event_coverage_scenarios'),
  ('public', 'event_faqs', 'company_isolation_event_faqs'),
  ('public', 'event_lineup_reveals', 'company_isolation_event_lineup_reveals'),
  ('public', 'event_lineups', 'company_isolation_event_lineups'),
  ('public', 'event_marketing', 'event_marketing_company_isolation'),
  ('public', 'event_sponsorship_targets', 'company_isolation_event_sponsorship_targets'),
  ('public', 'event_trackers', 'company_isolation_event_trackers'),
  ('public', 'festival_editions', 'company_isolation_festival_editions'),
  ('public', 'fever_buyers', 'company_isolation_fever_buyers'),
  ('public', 'help_questions', 'company_isolation_help_questions'),
  ('public', 'home_videos', 'home_videos_delete_company'),
  ('public', 'home_videos', 'home_videos_insert_company'),
  ('public', 'home_videos', 'home_videos_select_company'),
  ('public', 'home_videos', 'home_videos_update_company'),
  ('public', 'invoice_group_audit', 'company_isolation_invoice_group_audit'),
  ('public', 'lead_capture', 'lead_capture_admin_delete'),
  ('public', 'leads', 'company_isolation_leads'),
  ('public', 'meta_audience_sync_log', 'meta_audience_sync_log_insert'),
  ('public', 'meta_audience_sync_log', 'meta_audience_sync_log_select'),
  ('public', 'meta_audience_upload_members', 'meta_audience_upload_members_delete'),
  ('public', 'meta_audience_upload_members', 'meta_audience_upload_members_insert'),
  ('public', 'meta_audience_upload_members', 'meta_audience_upload_members_select'),
  ('public', 'meta_campaign_recommendations', 'tenant managers can update recommendations'),
  ('public', 'meta_campaign_recommendations', 'tenant members can read recommendations'),
  ('public', 'meta_custom_audiences', 'meta_custom_audiences_delete'),
  ('public', 'meta_custom_audiences', 'meta_custom_audiences_insert'),
  ('public', 'meta_custom_audiences', 'meta_custom_audiences_select'),
  ('public', 'meta_custom_audiences', 'meta_custom_audiences_update'),
  ('public', 'portal_settings', 'portal_settings_delete_company'),
  ('public', 'portal_settings', 'portal_settings_insert_company'),
  ('public', 'portal_settings', 'portal_settings_select_company'),
  ('public', 'portal_settings', 'portal_settings_update_company'),
  ('public', 'portal_sites', 'company_isolation_portal_sites'),
  ('public', 'sponsorship_segments', 'company_isolation_sponsorship_segments'),
  ('public', 'standalone_invoices', 'standalone_invoices_delete_new_owner_or_admin'),
  ('public', 'static_pages', 'static_pages_company_isolation'),
  ('public', 'storage_deletion_log', 'company_isolation_storage_deletion_log'),
  ('public', 'supplier_similarity_flags', 'supplier_similarity_flags_select'),
  ('public', 'supplier_similarity_flags', 'supplier_similarity_flags_update'),
  ('public', 'suppressed_emails', 'company_isolation_suppressed_emails'),
  ('public', 'sync_runs', 'sync_runs_select_authenticated'),
  ('public', 'system_audit_log', 'company_isolation_system_audit_log'),
  ('public', 'system_reminders', 'system_reminders_company_isolation'),
  ('public', 'ticket_office_statement_lines', 'company_isolation_tosl'),
  ('public', 'ticket_office_statements', 'company_isolation_tos'),
  ('public', 'ticketline_crosscheck_runs', 'crosscheck_select_company'),
  ('public', 'trash', 'company_isolation_trash'),
  ('public', 'undo_actions', 'company_isolation_undo_actions'),
  ('storage', 'objects', 'Camarim documents viewable by accountant'),
  ('storage', 'objects', 'Card docs viewable by accountant')
), real AS (
  SELECT schemaname::text, tablename::text, policyname::text FROM pg_policies
  WHERE qual ILIKE '%row_belongs_to_current_company%'
     OR with_check ILIKE '%row_belongs_to_current_company%'
)
SELECT 'repo_sem_live' AS diferenca, d.* FROM (TABLE esperado EXCEPT TABLE real) d
UNION ALL
SELECT 'live_sem_repo', d.* FROM (TABLE real EXCEPT TABLE esperado) d
ORDER BY 1, 2, 3, 4;

-- §2 — Funções (prosrc textual, inclui F).
-- Captura fornecida: public=25 antes, 26 depois (+ novo helper).
-- Repo: 26 antes, 27 depois; reconciliar nomes/aridades, não inferir paridade.
SELECT n.nspname, count(*) AS funcoes
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosrc ILIKE '%row_belongs_to_current_company%'
GROUP BY n.nspname;

WITH esperado_base(proname, pronargs) AS (VALUES
  ('_event_stage_access', 2),
  ('_run_invariant_checks_tenant', 0),
  ('batch_save_event_forecasts', 5),
  ('club_decide_attendance', 2),
  ('club_decide_guess', 2),
  ('club_mission_review', 3),
  ('club_points_void', 2),
  ('club_ranking', 2),
  ('club_terms_publish', 2),
  ('clube_newgang_list', 4),
  ('confirm_ticket_office_statement', 1),
  ('convert_transaction_to_partner_extra', 5),
  ('crm_meta_audience_collect_leads', 1),
  ('crm_meta_audience_collect_upload_members', 1),
  ('crm_rgpd_erase_contact', 1),
  ('crm_whatsapp_eligible', 1),
  ('delete_transaction_cascade', 4),
  ('event_stage_list', 0),
  ('get_event_zone_price_dynamics', 1),
  ('get_ticket_office_settlements_overview', 2),
  ('get_ticketing_divergences', 0),
  ('get_ticketing_sync_status', 0),
  ('reverse_ticket_office_settlement', 3),
  ('revert_partner_extra', 2),
  ('set_forecast_amount_observed', 3),
  ('zone_capacity_snapshot', 2)
), esperado AS (
  TABLE esperado_base
  UNION ALL
  SELECT 'row_belongs_to_current_company_or_platform', 1
  WHERE to_regprocedure('public.row_belongs_to_current_company_or_platform(uuid)') IS NOT NULL
), real AS (
  SELECT p.proname::text, p.pronargs::int FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosrc ILIKE '%row_belongs_to_current_company%'
)
SELECT 'repo_sem_live' AS diferenca, d.* FROM (TABLE esperado EXCEPT TABLE real) d
UNION ALL
SELECT 'live_sem_repo', d.* FROM (TABLE real EXCEPT TABLE esperado) d
ORDER BY 1, 2, 3;

SELECT p.oid::regprocedure AS assinatura, p.pronargs, p.prosecdef, p.provolatile,
       pg_get_userbyid(p.proowner) AS owner, p.proconfig, p.proacl,
       pg_get_functiondef(p.oid) AS definicao
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (
  p.prosrc ILIKE '%row_belongs_to_current_company%'
  OR p.proname='row_belongs_to_current_company'
) ORDER BY p.proname, p.pronargs;

-- Helper original: preservar owner/ACL. Novo: anon=false, authenticated/service_role=true;
-- PUBLIC revogado, conferir também proacl.
SELECT p.oid::regprocedure AS assinatura, r.role_name,
       has_function_privilege(r.role_name, p.oid, 'EXECUTE') AS pode_executar
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) r(role_name)
WHERE n.nspname='public' AND p.proname IN (
  'row_belongs_to_current_company', 'row_belongs_to_current_company_or_platform'
) ORDER BY 1, 2;

-- §3 — Nulabilidade e contagem NULL por tabela coberta com coluna company_id.
-- Correr como operador autorizado antes de SET ROLE: RLS não pode truncar as contagens.
-- Não alterar dados nem retirar o ramo NULL: decisão do Pedro após esta medição.
WITH cobertas AS (
  SELECT DISTINCT schemaname, tablename FROM pg_policies
  WHERE qual ILIKE '%row_belongs_to_current_company%'
     OR with_check ILIKE '%row_belongs_to_current_company%'
)
SELECT c.table_schema, c.table_name, c.is_nullable,
       ((xpath('/table/row/c/text()', query_to_xml(format(
         'select count(*) c from %I.%I where company_id is null',
         c.table_schema, c.table_name), false, true, '')))[1]::text)::bigint AS linhas_null
FROM cobertas p JOIN information_schema.columns c
  ON c.table_schema=p.schemaname AND c.table_name=p.tablename AND c.column_name='company_id'
ORDER BY c.table_schema, c.table_name;

-- §4 — Pedro com empresa ativa X; repetir antes/depois sem alterar o perfil.
-- Confirmar is_platform_admin=true e empresa atual=X.
-- Esperado fora_da_rls >0 antes, 0 depois, desde que existam fechos de outra empresa.
-- Sem fechos de Y, zero antes torna esta comparação inconclusiva.
BEGIN;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT set_config('request.jwt.claim.sub', '__PEDRO_UID__', true);
SET LOCAL ROLE authenticated;
SELECT current_user, auth.uid(), public.current_company_id(), public.is_platform_admin();
SELECT count(*) AS total_rpc,
       count(*) FILTER (WHERE o.id NOT IN (SELECT id FROM public.ticket_office_settlements)) AS fora_da_rls
FROM public.get_ticket_office_settlements_overview() o;
SELECT count(*) AS total_rls,
       count(*) FILTER (WHERE company_id <> public.current_company_id()) AS outra_empresa,
       count(*) FILTER (WHERE company_id IS NULL) AS sem_empresa
FROM public.ticket_office_settlements;
ROLLBACK;

-- Tenant normal: confirmar is_platform_admin=false e empresa atual=X.
-- Esperado fora_da_rls=0 e totais/visibilidade iguais antes/depois.
BEGIN;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT set_config('request.jwt.claim.sub', '__TENANT_UID__', true);
SET LOCAL ROLE authenticated;
SELECT current_user, auth.uid(), public.current_company_id(), public.is_platform_admin();
SELECT count(*) AS total_rpc,
       count(*) FILTER (WHERE o.id NOT IN (SELECT id FROM public.ticket_office_settlements)) AS fora_da_rls
FROM public.get_ticket_office_settlements_overview() o;
SELECT count(*) AS total_rls,
       count(*) FILTER (WHERE company_id <> public.current_company_id()) AS outra_empresa,
       count(*) FILTER (WHERE company_id IS NULL) AS sem_empresa
FROM public.ticket_office_settlements;
ROLLBACK;
