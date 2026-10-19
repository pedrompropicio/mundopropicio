-- REVIEW ONLY. SELECT-only readback AFTER separately authorized application; no provider calls.
SELECT singleton,revision,state,enabled,reviewed,active_claim,stage,reason_code,upstream_status FROM public.data_entry_analysis_control_333;
SELECT count(*) audit_rows,min(revision) first_revision,max(revision) last_revision,
 count(*) FILTER(WHERE admin_action IS NOT NULL) responsible_actions FROM public.data_entry_analysis_audit_333;
SELECT c.relname,pg_get_userbyid(c.relowner) owner,c.relrowsecurity,c.relacl::text acl,
 (SELECT jsonb_agg(jsonb_build_object('role',r,'select',has_table_privilege(r,c.oid,'SELECT'),'insert',has_table_privilege(r,c.oid,'INSERT'),'update',has_table_privilege(r,c.oid,'UPDATE'),'delete',has_table_privilege(r,c.oid,'DELETE'),'truncate',has_table_privilege(r,c.oid,'TRUNCATE'))) FROM unnest(ARRAY['anon','authenticated','service_role']) r) effective
FROM pg_class c WHERE c.oid IN ('public.data_entry_analysis_control_333'::regclass,'public.data_entry_analysis_audit_333'::regclass);
SELECT proname,pg_get_userbyid(proowner) owner,prosecdef,proconfig,proacl::text acl,md5(prosrc) source_md5,
 has_function_privilege('service_role',oid,'EXECUTE') service_execute,
 has_function_privilege('anon',oid,'EXECUTE') anon_execute,
 has_function_privilege('authenticated',oid,'EXECUTE') user_execute
FROM pg_proc WHERE oid IN ('public.data_entry_analysis_transition_333(text,uuid,bigint,text,integer)'::regprocedure,'public.data_entry_analysis_responsible_333(text,bigint,uuid,text)'::regprocedure);
SELECT count(*) registry_rows,max(id) registry_last_id FROM drizzle.__drizzle_migrations;
SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 2;
SELECT count(*) rows,count(*) FILTER(WHERE preparation_validated OR execute_validated) global_open FROM public.data_entry_settings;
SELECT count(*) rows,count(*) FILTER(WHERE enabled) scoped_open FROM public.data_entry_pilot8_allowlist;
SELECT count(*) rows,count(*) FILTER(WHERE enabled) attempt_open FROM public.standalone_attempt_settings_333;
