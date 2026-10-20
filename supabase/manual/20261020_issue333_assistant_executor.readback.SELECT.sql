-- #333 fase12e readback SELECT-only (antes/depois da aplicação autorizada e no fecho da janela).
SELECT enabled FROM public.data_entry_assistant_executor_settings_333;
SELECT action_id, count(*) FROM public.data_entry_assistant_executions_333 GROUP BY 1 ORDER BY 1;
SELECT c.relname, c.relrowsecurity, c.relacl::text acl,
  has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') anon_any, has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') user_any,
  has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') service_write
FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('data_entry_assistant_executor_settings_333','data_entry_assistant_executions_333') ORDER BY 1;
SELECT p.oid::regprocedure, prosecdef, proconfig, proacl::text, md5(prosrc) source_md5,
  has_function_privilege('anon', p.oid, 'EXECUTE') anon_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') user_exec, has_function_privilege('service_role', p.oid, 'EXECUTE') service_exec
FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND proname = 'data_entry_assistant_execute_333';
SELECT tgname FROM pg_trigger WHERE tgname LIKE 'de333_exec_%' ORDER BY 1;
SELECT md5(prosrc) confirm_writer_md5 FROM pg_proc WHERE oid = 'public.confirm_ticket_office_statement(uuid)'::regprocedure;
