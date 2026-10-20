-- Metadata only, before/after; no financial records.
SELECT p.oid::regprocedure signature,pg_get_userbyid(p.proowner) owner,md5(p.prosrc) source_md5,
 p.proacl::text acl,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition
FROM pg_proc p WHERE p.oid IN ('public.tosl_guard()'::regprocedure,'public.confirm_ticket_office_statement(uuid)'::regprocedure);
SELECT tgname,tgenabled,pg_get_triggerdef(oid) definition FROM pg_trigger
 WHERE tgrelid='public.ticket_office_statement_lines'::regclass AND tgname='trg_tosl_guard';
SELECT enabled FROM public.data_entry_assistant_review_settings_333;
SELECT enabled FROM public.data_entry_assistant_executor_settings_333;
SELECT count(*) scope FROM public.data_entry_assistant_scope_333;
