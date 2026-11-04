-- #591 / 0326 — PREPARADA, NÃO EXECUTADA contra bases nesta tarefa.
-- Pelo 0 em janela autorizada: guardar resultados antes da 0326 e repetir depois.
-- Só SELECT e contexto transacional descartável; sem DDL/DML ou perfis alterados.
-- Substituir os três placeholders na sessão, nunca versionar identidades reais.
-- Executar §1–§3 e §5 como operador com leitura integral; §4 aplica RLS como authenticated.

-- §1 — Corpo e impressão digital exacta; comparar também a assinatura/owner/ACL.
SELECT p.oid::regprocedure AS assinatura, pg_get_functiondef(p.oid) AS definicao,
       md5(pg_get_functiondef(p.oid)) AS md5_definicao,
       pg_get_userbyid(p.proowner) AS owner, p.proacl, p.proconfig, p.prosecdef, p.provolatile
FROM pg_proc p WHERE p.oid = 'public.row_belongs_to_current_company(uuid)'::regprocedure;

-- §2 — Lista explícita da prova 0313: 79 tabelas, 78 com company_id.
-- meta_audience_sync_log usa audiência indirectamente e não tem company_id.
-- A consulta ao catálogo permite detectar deriva da lista antes de aceitar a contagem.
SELECT DISTINCT p.schemaname, p.tablename
FROM pg_policies p JOIN information_schema.columns c
  ON c.table_schema=p.schemaname AND c.table_name=p.tablename AND c.column_name='company_id'
WHERE p.qual ILIKE '%row_belongs_to_current_company%'
   OR p.with_check ILIKE '%row_belongs_to_current_company%'
ORDER BY 1, 2;

SELECT 'public'::text AS schema_name, 'accountant_transaction_reviews'::text AS table_name, count(*) AS linhas_null FROM public.accountant_transaction_reviews WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'audience_members'::text AS table_name, count(*) AS linhas_null FROM public.audience_members WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'audience_snapshots'::text AS table_name, count(*) AS linhas_null FROM public.audience_snapshots WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'audiences'::text AS table_name, count(*) AS linhas_null FROM public.audiences WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'backup_runs'::text AS table_name, count(*) AS linhas_null FROM public.backup_runs WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'card_integrations'::text AS table_name, count(*) AS linhas_null FROM public.card_integrations WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'card_item_documents'::text AS table_name, count(*) AS linhas_null FROM public.card_item_documents WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'card_session_items'::text AS table_name, count(*) AS linhas_null FROM public.card_session_items WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'card_session_loads'::text AS table_name, count(*) AS linhas_null FROM public.card_session_loads WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'card_sessions'::text AS table_name, count(*) AS linhas_null FROM public.card_sessions WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_attendance_claims'::text AS table_name, count(*) AS linhas_null FROM public.club_attendance_claims WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_crew_members'::text AS table_name, count(*) AS linhas_null FROM public.club_crew_members WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_crews'::text AS table_name, count(*) AS linhas_null FROM public.club_crews WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_guesses'::text AS table_name, count(*) AS linhas_null FROM public.club_guesses WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_legacy_consumption'::text AS table_name, count(*) AS linhas_null FROM public.club_legacy_consumption WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_level_floors'::text AS table_name, count(*) AS linhas_null FROM public.club_level_floors WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_levels'::text AS table_name, count(*) AS linhas_null FROM public.club_levels WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_member_profiles'::text AS table_name, count(*) AS linhas_null FROM public.club_member_profiles WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_members'::text AS table_name, count(*) AS linhas_null FROM public.club_members WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_mission_submissions'::text AS table_name, count(*) AS linhas_null FROM public.club_mission_submissions WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_missions'::text AS table_name, count(*) AS linhas_null FROM public.club_missions WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_point_rules'::text AS table_name, count(*) AS linhas_null FROM public.club_point_rules WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_points'::text AS table_name, count(*) AS linhas_null FROM public.club_points WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_points_config'::text AS table_name, count(*) AS linhas_null FROM public.club_points_config WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_points_cutover_log'::text AS table_name, count(*) AS linhas_null FROM public.club_points_cutover_log WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_profile_settings'::text AS table_name, count(*) AS linhas_null FROM public.club_profile_settings WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_purchase_evidence'::text AS table_name, count(*) AS linhas_null FROM public.club_purchase_evidence WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_referral_events'::text AS table_name, count(*) AS linhas_null FROM public.club_referral_events WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_rewards'::text AS table_name, count(*) AS linhas_null FROM public.club_rewards WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_terms'::text AS table_name, count(*) AS linhas_null FROM public.club_terms WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'club_wallet_passes'::text AS table_name, count(*) AS linhas_null FROM public.club_wallet_passes WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'coala_invites'::text AS table_name, count(*) AS linhas_null FROM public.coala_invites WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'coala_list_consents'::text AS table_name, count(*) AS linhas_null FROM public.coala_list_consents WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'coala_send_runs'::text AS table_name, count(*) AS linhas_null FROM public.coala_send_runs WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'communication_log'::text AS table_name, count(*) AS linhas_null FROM public.communication_log WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'consent_log'::text AS table_name, count(*) AS linhas_null FROM public.consent_log WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'consent_text_versions'::text AS table_name, count(*) AS linhas_null FROM public.consent_text_versions WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'contacts'::text AS table_name, count(*) AS linhas_null FROM public.contacts WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'document_download_audit'::text AS table_name, count(*) AS linhas_null FROM public.document_download_audit WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'email_campaigns'::text AS table_name, count(*) AS linhas_null FROM public.email_campaigns WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'email_send_log'::text AS table_name, count(*) AS linhas_null FROM public.email_send_log WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'email_send_state'::text AS table_name, count(*) AS linhas_null FROM public.email_send_state WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'email_unsubscribe_tokens'::text AS table_name, count(*) AS linhas_null FROM public.email_unsubscribe_tokens WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'entity_documents'::text AS table_name, count(*) AS linhas_null FROM public.entity_documents WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'event_coverage_scenario_log'::text AS table_name, count(*) AS linhas_null FROM public.event_coverage_scenario_log WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'event_coverage_scenarios'::text AS table_name, count(*) AS linhas_null FROM public.event_coverage_scenarios WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'event_faqs'::text AS table_name, count(*) AS linhas_null FROM public.event_faqs WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'event_lineup_reveals'::text AS table_name, count(*) AS linhas_null FROM public.event_lineup_reveals WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'event_lineups'::text AS table_name, count(*) AS linhas_null FROM public.event_lineups WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'event_marketing'::text AS table_name, count(*) AS linhas_null FROM public.event_marketing WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'event_sponsorship_targets'::text AS table_name, count(*) AS linhas_null FROM public.event_sponsorship_targets WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'event_trackers'::text AS table_name, count(*) AS linhas_null FROM public.event_trackers WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'festival_editions'::text AS table_name, count(*) AS linhas_null FROM public.festival_editions WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'fever_buyers'::text AS table_name, count(*) AS linhas_null FROM public.fever_buyers WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'help_questions'::text AS table_name, count(*) AS linhas_null FROM public.help_questions WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'home_videos'::text AS table_name, count(*) AS linhas_null FROM public.home_videos WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'invoice_group_audit'::text AS table_name, count(*) AS linhas_null FROM public.invoice_group_audit WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'lead_capture'::text AS table_name, count(*) AS linhas_null FROM public.lead_capture WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'leads'::text AS table_name, count(*) AS linhas_null FROM public.leads WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'meta_audience_upload_members'::text AS table_name, count(*) AS linhas_null FROM public.meta_audience_upload_members WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'meta_campaign_recommendations'::text AS table_name, count(*) AS linhas_null FROM public.meta_campaign_recommendations WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'meta_custom_audiences'::text AS table_name, count(*) AS linhas_null FROM public.meta_custom_audiences WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'portal_settings'::text AS table_name, count(*) AS linhas_null FROM public.portal_settings WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'portal_sites'::text AS table_name, count(*) AS linhas_null FROM public.portal_sites WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'sponsorship_segments'::text AS table_name, count(*) AS linhas_null FROM public.sponsorship_segments WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'standalone_invoices'::text AS table_name, count(*) AS linhas_null FROM public.standalone_invoices WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'static_pages'::text AS table_name, count(*) AS linhas_null FROM public.static_pages WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'storage_deletion_log'::text AS table_name, count(*) AS linhas_null FROM public.storage_deletion_log WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'supplier_similarity_flags'::text AS table_name, count(*) AS linhas_null FROM public.supplier_similarity_flags WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'suppressed_emails'::text AS table_name, count(*) AS linhas_null FROM public.suppressed_emails WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'sync_runs'::text AS table_name, count(*) AS linhas_null FROM public.sync_runs WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'system_audit_log'::text AS table_name, count(*) AS linhas_null FROM public.system_audit_log WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'system_reminders'::text AS table_name, count(*) AS linhas_null FROM public.system_reminders WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'ticket_office_statement_lines'::text AS table_name, count(*) AS linhas_null FROM public.ticket_office_statement_lines WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'ticket_office_statements'::text AS table_name, count(*) AS linhas_null FROM public.ticket_office_statements WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'ticketline_crosscheck_runs'::text AS table_name, count(*) AS linhas_null FROM public.ticketline_crosscheck_runs WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'trash'::text AS table_name, count(*) AS linhas_null FROM public.trash WHERE company_id IS NULL
UNION ALL
SELECT 'public'::text AS schema_name, 'undo_actions'::text AS table_name, count(*) AS linhas_null FROM public.undo_actions WHERE company_id IS NULL
ORDER BY 1, 2;

-- §3 — Composição completa das cinco tabelas e das duas políticas de storage.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname='public' AND tablename IN
  ('sync_runs','email_send_log','system_audit_log','backup_runs','system_reminders'))
  OR (schemaname='storage' AND tablename='objects' AND policyname IN
    ('Camarim documents viewable by accountant','Card docs viewable by accountant'))
ORDER BY 1, 2, 3;

-- Sem cast uuid: NULLIF('', '') chega NULL à rbcc do Camarim; 'dossiers' causa 22P02.
-- Medir ambos, sem confundir o defeito antigo com o caso NULL modificado pela 0326.
SELECT bucket_id, count(*) AS objectos,
       count(*) FILTER (WHERE split_part(name, '/', 1)='') AS primeiro_segmento_vazio,
       count(*) FILTER (WHERE split_part(name, '/', 1)<>'' AND
         NOT pg_input_is_valid(split_part(name, '/', 1), 'uuid')) AS primeiro_segmento_nao_uuid,
       count(*) FILTER (WHERE name LIKE 'dossiers/%') AS dossiers
FROM storage.objects WHERE bucket_id IN ('camarim-documents','card-documents')
GROUP BY bucket_id ORDER BY bucket_id;

-- §4 — Antes: registar o resultado real, sem presumir fuga em todas as tabelas.
-- Depois: ADMIN/MANAGER NULL=0 nas cinco; PEDRO só vê os NULL que a PERMISSIVE autoriza.
-- Referência Live fornecida (04/11): sync=1379, email=592, audit=130, backup=54, reminders=2.
-- PEDRO esperado depois: 1379/0/130/54/2, se os dados não mudarem desde a medição.
-- email_send_log: nenhum authenticated lê antes/depois, incluindo PEDRO (esperado 0).
-- Guardar também linhas com empresa por perfil e comparar antes/depois sem alterações.

BEGIN;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '__ADMIN_UID__', true);
SET LOCAL ROLE authenticated;
SELECT current_user, auth.uid(), public.current_company_id(), public.is_platform_admin(),
       public.row_belongs_to_current_company(NULL) AS rbcc_null,
       public.row_belongs_to_current_company_or_platform(NULL) AS or_platform_null;
SELECT 'sync_runs'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id=public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id<>public.current_company_id()) AS outra FROM public.sync_runs
UNION ALL
SELECT 'email_send_log'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id=public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id<>public.current_company_id()) AS outra FROM public.email_send_log
UNION ALL
SELECT 'system_audit_log'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id=public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id<>public.current_company_id()) AS outra FROM public.system_audit_log
UNION ALL
SELECT 'backup_runs'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id=public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id<>public.current_company_id()) AS outra FROM public.backup_runs
UNION ALL
SELECT 'system_reminders'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id=public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id<>public.current_company_id()) AS outra FROM public.system_reminders
ORDER BY 1;
ROLLBACK;

BEGIN;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '__MANAGER_UID__', true);
SET LOCAL ROLE authenticated;
SELECT current_user, auth.uid(), public.current_company_id(), public.is_platform_admin(),
       public.row_belongs_to_current_company(NULL) AS rbcc_null,
       public.row_belongs_to_current_company_or_platform(NULL) AS or_platform_null;
SELECT 'sync_runs'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id=public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id<>public.current_company_id()) AS outra FROM public.sync_runs
UNION ALL
SELECT 'email_send_log'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id=public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id<>public.current_company_id()) AS outra FROM public.email_send_log
UNION ALL
SELECT 'system_audit_log'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id=public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id<>public.current_company_id()) AS outra FROM public.system_audit_log
UNION ALL
SELECT 'backup_runs'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id=public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id<>public.current_company_id()) AS outra FROM public.backup_runs
UNION ALL
SELECT 'system_reminders'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id=public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id<>public.current_company_id()) AS outra FROM public.system_reminders
ORDER BY 1;
ROLLBACK;

BEGIN;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '__PEDRO_UID__', true);
SET LOCAL ROLE authenticated;
SELECT current_user, auth.uid(), public.current_company_id(), public.is_platform_admin(),
       public.row_belongs_to_current_company(NULL) AS rbcc_null,
       public.row_belongs_to_current_company_or_platform(NULL) AS or_platform_null;
SELECT 'sync_runs'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id=public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id<>public.current_company_id()) AS outra FROM public.sync_runs
UNION ALL
SELECT 'email_send_log'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id=public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id<>public.current_company_id()) AS outra FROM public.email_send_log
UNION ALL
SELECT 'system_audit_log'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id=public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id<>public.current_company_id()) AS outra FROM public.system_audit_log
UNION ALL
SELECT 'backup_runs'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id=public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id<>public.current_company_id()) AS outra FROM public.backup_runs
UNION ALL
SELECT 'system_reminders'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id=public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id<>public.current_company_id()) AS outra FROM public.system_reminders
ORDER BY 1;
ROLLBACK;

-- §5 — Risco de INSERT/UPDATE: company_id nullable sem default, coberto por WITH CHECK
-- ou por FOR ALL que herda USING. Incluir triggers para distinguir preenchimento real.
SELECT p.schemaname, p.tablename, p.policyname, p.permissive, p.roles, p.cmd,
       c.is_nullable, c.column_default, p.qual, p.with_check,
       ARRAY(SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t
         WHERE t.tgrelid=cl.oid AND NOT t.tgisinternal ORDER BY t.tgname) AS triggers
FROM pg_policies p JOIN information_schema.columns c
  ON c.table_schema=p.schemaname AND c.table_name=p.tablename AND c.column_name='company_id'
JOIN pg_namespace n ON n.nspname=p.schemaname
JOIN pg_class cl ON cl.relnamespace=n.oid AND cl.relname=p.tablename
WHERE c.is_nullable='YES' AND c.column_default IS NULL
  AND (p.with_check ILIKE '%row_belongs_to_current_company%'
    OR (p.cmd='ALL' AND p.with_check IS NULL AND p.qual ILIKE '%row_belongs_to_current_company%'))
ORDER BY 1, 2, 3;
