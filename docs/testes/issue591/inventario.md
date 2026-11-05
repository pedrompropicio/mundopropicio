# #591 — inventário de âmbito (0313 preparada, não aplicada)

Base local: `00de327d5d2d8f1744fb106679f2cfafe3c72665`. Despacho 6618663903 com correção do fecho 41743710203: sem uid, `rbcc(X) IS NOT TRUE` (o valor é NULL). Nenhuma leitura de Live nesta execução.

Método: cadeia `supabase/migrations` por nome, seguida de `drizzle/migrations` por número, até 0312; última definição por (schema, tabela, política) e (função, aridade), aplicando DROP POLICY/FUNCTION/TABLE e ALTER POLICY e expandindo FOREACH/EXECUTE format. Comentários de rollback não são DDL. Resultado conferido: **93 políticas public em 79 tabelas, 2 storage.objects e 26 funções public**. As políticas artísticas substituídas por `user_has_company_access` nas 0010/0146 não contam. A otimização de `auth.uid()` por ALTER POLICY em `20260914223845_856916d8-c1c9-45b8-8d42-28cb4bb820dc.sql` conserva as referências; as origens abaixo identificam as definições que introduzem os predicados. Sem views dependentes identificadas no levantamento do despacho.

A captura Live fornecida indica 93 políticas public e 25 funções (03/11/2026); não é uma leitura desta tarefa. Diferenças de nomes e da 26.ª função exigem reconciliação na janela. A prova §1–2 compara conjuntos nos dois sentidos; qualquer EXCEPT não vazio exige análise antes da aplicação, mesmo com contagens iguais.

Classes: **P** = plataforma, só backup_runs passa a `_or_platform`; **X** = ramo explícito de plataforma independente do helper, sem reescrita; **D** = decisão do Pedro pendente, por omissão E; **F** = falso positivo textual; **E** = empresa, conserva a chamada ao helper que passa a estrito. `companies` já usa `is_platform_admin()` explícito. `run_invariant_checks` não chama o helper: segue na #498.

Provas: §1 = identidade/expressões das políticas na janela; §2 = corpo, SECURITY DEFINER, owner/configuração/ACL e diferenças das funções; §3 = nulabilidade/contagens; §4 = visibilidade RPC/RLS com sessão. O teste `src/test/issue591-row-scope-sql.test.ts` cobre o helper partilhado, RLS representativa de trash/backup_runs e o WHERE SECDEF extraído da 0078; não executa individualmente os 121 consumidores.

## Políticas

| Objecto (schema.tabela · política) | Origem | Classe | Prova |
| --- | --- | --- | --- |
| `public.accountant_transaction_reviews · company_isolation_accountant_transaction_reviews` | `supabase/migrations/20260811170757_63eb1f9e-3a74-4405-9009-f332a21be74e.sql:71` | E | §1, §3 se company_id; helper estrito |
| `public.audience_members · audience_members_company_isolation` | `supabase/migrations/20260606000438_f68d52e5-d683-4318-9d0d-a9419d3f8368.sql:162` | E | §1, §3 se company_id; helper estrito |
| `public.audience_snapshots · audience_snapshots_company_isolation` | `supabase/migrations/20260606000438_f68d52e5-d683-4318-9d0d-a9419d3f8368.sql:142` | E | §1, §3 se company_id; helper estrito |
| `public.audiences · audiences_company_isolation` | `supabase/migrations/20260606000438_f68d52e5-d683-4318-9d0d-a9419d3f8368.sql:118` | E | §1, §3 se company_id; helper estrito |
| `public.backup_runs · company_isolation_backup_runs` | `supabase/migrations/20260917222206_cc918411-1854-44d9-bca2-265a9418485a.sql:40` | P | §1, §3; teste backup_runs |
| `public.card_integrations · card_integrations_company_isolation` | `supabase/migrations/20260903085611_14fcf6ee-7ad8-4fd6-bfbe-b641d41b247a.sql:119` | E | §1, §3 se company_id; helper estrito |
| `public.card_item_documents · card_item_documents_company_isolation` | `supabase/migrations/20260903085611_14fcf6ee-7ad8-4fd6-bfbe-b641d41b247a.sql:35` | E | §1, §3 se company_id; helper estrito |
| `public.card_session_items · card_session_items_company_isolation` | `supabase/migrations/20260709164409_a341582a-94f5-44f9-87e4-505856fd084a.sql:198` | E | §1, §3 se company_id; helper estrito |
| `public.card_session_loads · card_session_loads_company_isolation` | `supabase/migrations/20260709164409_a341582a-94f5-44f9-87e4-505856fd084a.sql:170` | E | §1, §3 se company_id; helper estrito |
| `public.card_sessions · card_sessions_company_isolation` | `supabase/migrations/20260709164409_a341582a-94f5-44f9-87e4-505856fd084a.sql:142` | E | §1, §3 se company_id; helper estrito |
| `public.club_attendance_claims · company_isolation_club_attendance_claims` | `drizzle/migrations/0120_0120_newgang_portal_sites_editions_club.sql:112` | E | §1, §3 se company_id; helper estrito |
| `public.club_crew_members · company_isolation_club_crew_members` | `drizzle/migrations/0143_derp274_club_crews.sql:44` | E | §1, §3 se company_id; helper estrito |
| `public.club_crews · company_isolation_club_crews` | `drizzle/migrations/0143_derp274_club_crews.sql:40` | E | §1, §3 se company_id; helper estrito |
| `public.club_guesses · company_isolation_club_guesses` | `drizzle/migrations/0120_0120_newgang_portal_sites_editions_club.sql:112` | E | §1, §3 se company_id; helper estrito |
| `public.club_legacy_consumption · club_legacy_consumption_select_staff` | `drizzle/migrations/0177_issue327_club_points_core.sql:145` | E | §1, §3 se company_id; helper estrito |
| `public.club_level_floors · club_level_floors_select_staff` | `drizzle/migrations/0177_issue327_club_points_core.sql:145` | E | §1, §3 se company_id; helper estrito |
| `public.club_levels · company_isolation_club_levels` | `drizzle/migrations/0120_0120_newgang_portal_sites_editions_club.sql:112` | E | §1, §3 se company_id; helper estrito |
| `public.club_member_profiles · member_profile_staff` | `drizzle/migrations/0179_issue330_profile_infra_off.sql:41` | E | §1, §3 se company_id; helper estrito |
| `public.club_members · company_isolation_club_members` | `drizzle/migrations/0120_0120_newgang_portal_sites_editions_club.sql:112` | E | §1, §3 se company_id; helper estrito |
| `public.club_mission_submissions · company_isolation_club_mission_submissions` | `drizzle/migrations/0141_derp272_club_missions.sql:59` | E | §1, §3 se company_id; helper estrito |
| `public.club_missions · company_isolation_club_missions` | `drizzle/migrations/0141_derp272_club_missions.sql:59` | E | §1, §3 se company_id; helper estrito |
| `public.club_point_rules · company_isolation_club_point_rules` | `drizzle/migrations/0120_0120_newgang_portal_sites_editions_club.sql:112` | E | §1, §3 se company_id; helper estrito |
| `public.club_points · company_isolation_club_points` | `drizzle/migrations/0120_0120_newgang_portal_sites_editions_club.sql:112` | E | §1, §3 se company_id; helper estrito |
| `public.club_points_config · club_points_config_select_staff` | `drizzle/migrations/0177_issue327_club_points_core.sql:145` | E | §1, §3 se company_id; helper estrito |
| `public.club_points_cutover_log · club_points_cutover_log_select_staff` | `drizzle/migrations/0177_issue327_club_points_core.sql:145` | E | §1, §3 se company_id; helper estrito |
| `public.club_profile_settings · profile_settings_staff` | `drizzle/migrations/0179_issue330_profile_infra_off.sql:21` | E | §1, §3 se company_id; helper estrito |
| `public.club_purchase_evidence · club_purchase_evidence_select_staff` | `drizzle/migrations/0177_issue327_club_points_core.sql:145` | E | §1, §3 se company_id; helper estrito |
| `public.club_referral_events · club_referral_events_select_staff` | `drizzle/migrations/0177_issue327_club_points_core.sql:145` | E | §1, §3 se company_id; helper estrito |
| `public.club_rewards · company_isolation_club_rewards` | `drizzle/migrations/0120_0120_newgang_portal_sites_editions_club.sql:112` | E | §1, §3 se company_id; helper estrito |
| `public.club_terms · company_isolation_club_terms` | `drizzle/migrations/0140_derp271_club_terms.sql:23` | E | §1, §3 se company_id; helper estrito |
| `public.club_wallet_passes · company_isolation_club_wallet_passes` | `drizzle/migrations/0144_derp275_club_wallet_passes.sql:19` | E | §1, §3 se company_id; helper estrito |
| `public.coala_invites · coala_invites_read` | `drizzle/migrations/0149_coala_eb_invite_a_structure.sql:42` | E | §1, §3 se company_id; helper estrito |
| `public.coala_list_consents · coala_list_consents_read` | `drizzle/migrations/0149_coala_eb_invite_a_structure.sql:44` | E | §1, §3 se company_id; helper estrito |
| `public.coala_send_runs · coala_send_runs_read` | `drizzle/migrations/0149_coala_eb_invite_a_structure.sql:46` | E | §1, §3 se company_id; helper estrito |
| `public.communication_log · communication_log_company_isolation` | `supabase/migrations/20260606000438_f68d52e5-d683-4318-9d0d-a9419d3f8368.sql:218` | E | §1, §3 se company_id; helper estrito |
| `public.consent_log · consent_log_select_admin` | `drizzle/migrations/0039_0039_derp194_rls_company_predicate_3_policies.sql:14` | E | §1, §3 se company_id; helper estrito |
| `public.consent_text_versions · consent_text_versions_read` | `drizzle/migrations/0250_issue359_consent_text_versions_a.sql:21` | E | §1, §3 se company_id; helper estrito |
| `public.contacts · company_isolation_contacts` | `supabase/migrations/20260604102244_775dbbaf-fb46-4387-9b8e-33ffbcd970e9.sql:190` | E | §1, §3 se company_id; helper estrito |
| `public.document_download_audit · dda_select_admin_manager` | `supabase/migrations/20260608202509_536eef28-1923-4ac0-828b-54eebf0f5edf.sql:27` | X | §1; ramo explícito intacto |
| `public.email_campaigns · email_campaigns_company_isolation` | `supabase/migrations/20260606000438_f68d52e5-d683-4318-9d0d-a9419d3f8368.sql:192` | E | §1, §3 se company_id; helper estrito |
| `public.email_send_log · company_isolation_email_send_log` | `supabase/migrations/20260429023935_9cabcd96-9609-4764-8ca4-7ec57c4123e1.sql:75` | E | §1, §3 se company_id; helper estrito |
| `public.email_send_state · company_isolation_email_send_state` | `supabase/migrations/20260429023935_9cabcd96-9609-4764-8ca4-7ec57c4123e1.sql:75` | E | §1, §3 se company_id; helper estrito |
| `public.email_unsubscribe_tokens · company_isolation_email_unsubscribe_tokens` | `supabase/migrations/20260429023935_9cabcd96-9609-4764-8ca4-7ec57c4123e1.sql:75` | E | §1, §3 se company_id; helper estrito |
| `public.entity_documents · company_isolation_entity_documents` | `supabase/migrations/20260830094937_6abd3767-49af-48de-a1cb-7fbbeb1df4d2.sql:26` | E | §1, §3 se company_id; helper estrito |
| `public.event_coverage_scenario_log · company_isolation_event_coverage_scenario_log` | `drizzle/migrations/0289_0289_p5c_cenario_receita_prevista.sql:83` | E | §1, §3 se company_id; helper estrito |
| `public.event_coverage_scenarios · company_isolation_event_coverage_scenarios` | `drizzle/migrations/0289_0289_p5c_cenario_receita_prevista.sql:71` | E | §1, §3 se company_id; helper estrito |
| `public.event_faqs · company_isolation_event_faqs` | `supabase/migrations/20260604102244_775dbbaf-fb46-4387-9b8e-33ffbcd970e9.sql:177` | E | §1, §3 se company_id; helper estrito |
| `public.event_lineup_reveals · company_isolation_event_lineup_reveals` | `drizzle/migrations/0119_0119_newgang_lineup_reveals_security.sql:27` | E | §1, §3 se company_id; helper estrito |
| `public.event_lineups · company_isolation_event_lineups` | `supabase/migrations/20260604102244_775dbbaf-fb46-4387-9b8e-33ffbcd970e9.sql:168` | E | §1, §3 se company_id; helper estrito |
| `public.event_marketing · event_marketing_company_isolation` | `supabase/migrations/20260606000438_f68d52e5-d683-4318-9d0d-a9419d3f8368.sql:62` | E | §1, §3 se company_id; helper estrito |
| `public.event_sponsorship_targets · company_isolation_event_sponsorship_targets` | `supabase/migrations/20260905234544_230a9dc7-e96c-4172-bdb6-70e606a3cb0c.sql:106` | E | §1, §3 se company_id; helper estrito |
| `public.event_trackers · company_isolation_event_trackers` | `drizzle/migrations/0106_derp248_tiktok_event_trackers.sql:25` | E | §1, §3 se company_id; helper estrito |
| `public.festival_editions · company_isolation_festival_editions` | `drizzle/migrations/0120_0120_newgang_portal_sites_editions_club.sql:112` | E | §1, §3 se company_id; helper estrito |
| `public.fever_buyers · company_isolation_fever_buyers` | `drizzle/migrations/0112_derp253_fever_buyers.sql:48` | E | §1, §3 se company_id; helper estrito |
| `public.help_questions · company_isolation_help_questions` | `supabase/migrations/20260916223853_ad31b426-be5b-4764-8c13-dc94aa96a8b1.sql:77` | D | §1, §3; decisão pendente, fica E |
| `public.home_videos · home_videos_delete_company` | `supabase/migrations/20260607032323_7487e751-3943-4709-88d5-c9a2707bd734.sql:42` | E | §1, §3 se company_id; helper estrito |
| `public.home_videos · home_videos_insert_company` | `supabase/migrations/20260607032323_7487e751-3943-4709-88d5-c9a2707bd734.sql:33` | E | §1, §3 se company_id; helper estrito |
| `public.home_videos · home_videos_select_company` | `supabase/migrations/20260607032323_7487e751-3943-4709-88d5-c9a2707bd734.sql:29` | E | §1, §3 se company_id; helper estrito |
| `public.home_videos · home_videos_update_company` | `supabase/migrations/20260607032323_7487e751-3943-4709-88d5-c9a2707bd734.sql:37` | E | §1, §3 se company_id; helper estrito |
| `public.invoice_group_audit · company_isolation_invoice_group_audit` | `supabase/migrations/20260908155214_172ccbfb-6cc9-460f-9829-df7973015679.sql:38` | E | §1, §3 se company_id; helper estrito |
| `public.lead_capture · lead_capture_admin_delete` | `drizzle/migrations/0039_0039_derp194_rls_company_predicate_3_policies.sql:3` | E | §1, §3 se company_id; helper estrito |
| `public.leads · company_isolation_leads` | `supabase/migrations/20260604102244_775dbbaf-fb46-4387-9b8e-33ffbcd970e9.sql:203` | E | §1, §3 se company_id; helper estrito |
| `public.meta_audience_sync_log · meta_audience_sync_log_insert` | `supabase/migrations/20260607130520_0b9986c2-bb77-4b2a-804f-09f9622296d0.sql:119` | E | §1, §3 se company_id; helper estrito |
| `public.meta_audience_sync_log · meta_audience_sync_log_select` | `supabase/migrations/20260607130520_0b9986c2-bb77-4b2a-804f-09f9622296d0.sql:104` | E | §1, §3 se company_id; helper estrito |
| `public.meta_audience_upload_members · meta_audience_upload_members_delete` | `supabase/migrations/20260701012433_a78e411c-c819-49b5-a71b-edf8343be3be.sql:71` | E | §1, §3 se company_id; helper estrito |
| `public.meta_audience_upload_members · meta_audience_upload_members_insert` | `supabase/migrations/20260701012433_a78e411c-c819-49b5-a71b-edf8343be3be.sql:59` | E | §1, §3 se company_id; helper estrito |
| `public.meta_audience_upload_members · meta_audience_upload_members_select` | `supabase/migrations/20260701012433_a78e411c-c819-49b5-a71b-edf8343be3be.sql:47` | E | §1, §3 se company_id; helper estrito |
| `public.meta_campaign_recommendations · tenant managers can update recommendations` | `supabase/migrations/20260628201726_db4fb302-f2f3-4a91-a8b7-d13e7571e377.sql:57` | E | §1, §3 se company_id; helper estrito |
| `public.meta_campaign_recommendations · tenant members can read recommendations` | `supabase/migrations/20260628201726_db4fb302-f2f3-4a91-a8b7-d13e7571e377.sql:51` | E | §1, §3 se company_id; helper estrito |
| `public.meta_custom_audiences · meta_custom_audiences_delete` | `supabase/migrations/20260607130520_0b9986c2-bb77-4b2a-804f-09f9622296d0.sql:70` | E | §1, §3 se company_id; helper estrito |
| `public.meta_custom_audiences · meta_custom_audiences_insert` | `supabase/migrations/20260607130520_0b9986c2-bb77-4b2a-804f-09f9622296d0.sql:43` | E | §1, §3 se company_id; helper estrito |
| `public.meta_custom_audiences · meta_custom_audiences_select` | `supabase/migrations/20260607130520_0b9986c2-bb77-4b2a-804f-09f9622296d0.sql:32` | E | §1, §3 se company_id; helper estrito |
| `public.meta_custom_audiences · meta_custom_audiences_update` | `supabase/migrations/20260607130520_0b9986c2-bb77-4b2a-804f-09f9622296d0.sql:53` | E | §1, §3 se company_id; helper estrito |
| `public.portal_settings · portal_settings_delete_company` | `supabase/migrations/20260607034206_3ee4f885-02ed-4fb3-b869-4d610d96d658.sql:36` | E | §1, §3 se company_id; helper estrito |
| `public.portal_settings · portal_settings_insert_company` | `supabase/migrations/20260607034206_3ee4f885-02ed-4fb3-b869-4d610d96d658.sql:30` | E | §1, §3 se company_id; helper estrito |
| `public.portal_settings · portal_settings_select_company` | `supabase/migrations/20260607034206_3ee4f885-02ed-4fb3-b869-4d610d96d658.sql:28` | E | §1, §3 se company_id; helper estrito |
| `public.portal_settings · portal_settings_update_company` | `supabase/migrations/20260607034206_3ee4f885-02ed-4fb3-b869-4d610d96d658.sql:32` | E | §1, §3 se company_id; helper estrito |
| `public.portal_sites · company_isolation_portal_sites` | `drizzle/migrations/0120_0120_newgang_portal_sites_editions_club.sql:112` | E | §1, §3 se company_id; helper estrito |
| `public.sponsorship_segments · company_isolation_sponsorship_segments` | `supabase/migrations/20260905234544_230a9dc7-e96c-4172-bdb6-70e606a3cb0c.sql:29` | E | §1, §3 se company_id; helper estrito |
| `public.standalone_invoices · standalone_invoices_delete_new_owner_or_admin` | `supabase/migrations/20260813023219_40e791df-c15a-4e80-96dc-3a49914f1a51.sql:13` | E | §1, §3 se company_id; helper estrito |
| `public.static_pages · static_pages_company_isolation` | `supabase/migrations/20260606000438_f68d52e5-d683-4318-9d0d-a9419d3f8368.sql:93` | E | §1, §3 se company_id; helper estrito |
| `public.storage_deletion_log · company_isolation_storage_deletion_log` | `supabase/migrations/20260930173444_430707bf-29ee-45ff-a797-57194faca209.sql:23` | E | §1, §3 se company_id; helper estrito |
| `public.supplier_similarity_flags · supplier_similarity_flags_select` | `drizzle/migrations/0048_derp201_supplier_similarity_flags.sql:73` | E | §1, §3 se company_id; helper estrito |
| `public.supplier_similarity_flags · supplier_similarity_flags_update` | `drizzle/migrations/0048_derp201_supplier_similarity_flags.sql:77` | E | §1, §3 se company_id; helper estrito |
| `public.suppressed_emails · company_isolation_suppressed_emails` | `supabase/migrations/20260429023935_9cabcd96-9609-4764-8ca4-7ec57c4123e1.sql:75` | E | §1, §3 se company_id; helper estrito |
| `public.sync_runs · sync_runs_select_authenticated` | `drizzle/migrations/0039_0039_derp194_rls_company_predicate_3_policies.sql:9` | E | §1, §3 se company_id; helper estrito |
| `public.system_audit_log · company_isolation_system_audit_log` | `supabase/migrations/20260429023935_9cabcd96-9609-4764-8ca4-7ec57c4123e1.sql:75` | E | §1, §3 se company_id; helper estrito |
| `public.system_reminders · system_reminders_company_isolation` | `drizzle/migrations/0038_0038_derp193_health_recipients_per_company.sql:7` | E | §1, §3 se company_id; helper estrito |
| `public.ticket_office_statement_lines · company_isolation_tosl` | `drizzle/migrations/0077_derp231_ticket_office_statements.sql:68` | E | §1, §3 se company_id; helper estrito |
| `public.ticket_office_statements · company_isolation_tos` | `drizzle/migrations/0077_derp231_ticket_office_statements.sql:61` | E | §1, §3 se company_id; helper estrito |
| `public.ticketline_crosscheck_runs · crosscheck_select_company` | `supabase/migrations/20260930165649_13c9996b-7e74-4755-a920-cb0facf0fa81.sql:21` | E | §1, §3 se company_id; helper estrito |
| `public.trash · company_isolation_trash` | `supabase/migrations/20260429023935_9cabcd96-9609-4764-8ca4-7ec57c4123e1.sql:75` | E | §1, §3 se company_id; helper estrito; teste RLS trash |
| `public.undo_actions · company_isolation_undo_actions` | `supabase/migrations/20260429023935_9cabcd96-9609-4764-8ca4-7ec57c4123e1.sql:75` | E | §1, §3 se company_id; helper estrito |
| `storage.objects · Camarim documents viewable by accountant` | `supabase/migrations/20260811163757_0a3742a3-58ae-4969-8b7e-b6eda5a51032.sql:11` | E | §1, §3 se company_id; helper estrito |
| `storage.objects · Card docs viewable by accountant` | `supabase/migrations/20260923023459_8af074c1-d5cb-476b-ae4d-c7a396b3b42e.sql:1` | E | §1, §3 se company_id; helper estrito |

## Funções

As 26 definições são SECURITY DEFINER; a prova §2 verifica o catálogo real e as sobrecargas.

| Objecto (nome / nº argumentos) | Origem | Classe | Prova |
| --- | --- | --- | --- |
| `public._event_stage_access / 2` | `drizzle/migrations/0280_p1_event_stages.sql:28` | E | §2; helper estrito |
| `public._run_invariant_checks_tenant / 0` | `drizzle/migrations/0041_0041_derp195_invariants_tenant_predicate.sql:6` | F | §2; regex prosrc !~*, sem chamada ao helper |
| `public.batch_save_event_forecasts / 5` | `drizzle/migrations/0056_bp_grid_atomic_save.sql:2` | E | §2; helper estrito |
| `public.club_decide_attendance / 2` | `drizzle/migrations/0120_0120_newgang_portal_sites_editions_club.sql:211` | E | §2; helper estrito |
| `public.club_decide_guess / 2` | `drizzle/migrations/0142_derp273_club_points_void.sql:59` | E | §2; helper estrito |
| `public.club_mission_review / 3` | `drizzle/migrations/0141_derp272_club_missions.sql:141` | E | §2; helper estrito |
| `public.club_points_void / 2` | `drizzle/migrations/0142_derp273_club_points_void.sql:71` | E | §2; helper estrito |
| `public.club_ranking / 2` | `drizzle/migrations/0177_issue327_club_points_core.sql:345` | E | §2; helper estrito |
| `public.club_terms_publish / 2` | `drizzle/migrations/0140_derp271_club_terms.sql:33` | E | §2; helper estrito |
| `public.clube_newgang_list / 4` | `drizzle/migrations/0199_newgang_crm_profile_fields.sql:9` | E | §2; helper estrito |
| `public.confirm_ticket_office_statement / 1` | `drizzle/migrations/0077_derp231_ticket_office_statements.sql:91` | E | §2; helper estrito |
| `public.convert_transaction_to_partner_extra / 5` | `drizzle/migrations/0066_derp218_silent_writes_partner_extra_reversal_link_date.sql:21` | E | §2; helper estrito |
| `public.crm_meta_audience_collect_leads / 1` | `drizzle/migrations/0266_issue314_fase1_versoes_idade_real.sql:257` | E | §2; helper estrito |
| `public.crm_meta_audience_collect_upload_members / 1` | `supabase/migrations/20260701012433_a78e411c-c819-49b5-a71b-edf8343be3be.sql:85` | E | §2; helper estrito |
| `public.crm_rgpd_erase_contact / 1` | `supabase/migrations/20260607165524_f07ce713-4e6d-4985-a066-603f1602d062.sql:266` | X | §2; is_platform_admin(v_caller) explícito |
| `public.crm_whatsapp_eligible / 1` | `drizzle/migrations/0279_0279_issue359_ponto4_eligible.sql:4` | E | §2; helper estrito |
| `public.delete_transaction_cascade / 4` | `drizzle/migrations/0067_derp219_delete_cascade_settlement_reverse_forecast_amount_rateio.sql:4` | E | §2; helper estrito |
| `public.event_stage_list / 0` | `drizzle/migrations/0280_p1_event_stages.sql:60` | E | §2; helper estrito |
| `public.get_event_zone_price_dynamics / 1` | `supabase/migrations/20260923025831_e27942b7-f1a8-46bb-bd3b-eefc53717a9e.sql:1` | E | §2; helper estrito |
| `public.get_ticket_office_settlements_overview / 2` | `drizzle/migrations/0078_derp232_direito_do_evento.sql:26` | E | §2; helper estrito; §4; teste SECDEF com WHERE da 0078 |
| `public.get_ticketing_divergences / 0` | `drizzle/migrations/0037_derp192_ticketing_divergences_rpc.sql:3` | E | §2; helper estrito |
| `public.get_ticketing_sync_status / 0` | `drizzle/migrations/0054_derp197_ticketing_conditions_screen_and_settlements_overview.sql:93` | E | §2; helper estrito |
| `public.reverse_ticket_office_settlement / 3` | `drizzle/migrations/0067_derp219_delete_cascade_settlement_reverse_forecast_amount_rateio.sql:107` | E | §2; helper estrito |
| `public.revert_partner_extra / 2` | `drizzle/migrations/0066_derp218_silent_writes_partner_extra_reversal_link_date.sql:56` | E | §2; helper estrito |
| `public.set_forecast_amount_observed / 3` | `drizzle/migrations/0067_derp219_delete_cascade_settlement_reverse_forecast_amount_rateio.sql:169` | E | §2; helper estrito |
| `public.zone_capacity_snapshot / 2` | `supabase/migrations/20260903123919_67cfc8db-8fe5-4009-b77b-d1af62197ec0.sql:1` | E | §2; helper estrito |

## Decisões e lacunas retidas

- O ramo `_row_company_id IS NULL` mantém-se: a prova §3 prepara contagens; decisão e eventual migração própria pertencem ao Pedro.
- `company_isolation_help_questions` fica E por omissão; Admin › Lacunas do manual é partilhado com admin de empresa e aguarda decisão do Pedro.
- `dda_select_admin_manager` permite a um admin de qualquer empresa ler downloads de todas pelo ramo `has_role(admin)` sem empresa; achado X registado, não corrigido.
- `crm_rgpd_erase_contact` conserva o bypass `is_platform_admin(v_caller)` explícito e não recebe o novo helper.
- As políticas com `has_role(... platform_admin) AND rbcc(...)` continuam E: consent_log, lead_capture, supplier_similarity_flags e meta_audience_upload_members; o AND conserva o âmbito da empresa.
- `backup_runs` é P para backups globais; nenhum ecrã o lê por RLS segundo o despacho. O teste cobre X/Y e global NULL, preservando a condição original de acesso ao global.
- Sem uid, `current_company_id()` é NULL; `rbcc(X)` é NULL antes/depois e `IS NOT TRUE` é verdadeiro. RLS recusa X/Y, mas `rbcc(NULL)` é verdadeiro. Nenhum COALESCE ou flag GUC foi acrescentado ao corpo de E.
- A prova de janela está preparada e não executada: contagens NULL, deriva 93/25 vs 93/26, ACL/owner e visibilidade reais ficam para o 0 com Sim pelo PROC-promocao.
