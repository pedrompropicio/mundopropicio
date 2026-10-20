-- #333 fase12d readback SELECT-only, antes e depois da aplicação separadamente autorizada.
SELECT enabled FROM public.data_entry_assistant_review_settings_333;
SELECT (SELECT count(*) FROM public.data_entry_assistant_reviews_333) reviews, (SELECT count(*) FROM public.data_entry_assistant_authorizations_333) authorizations;
SELECT c.relname, c.relrowsecurity, c.relacl::text acl,
  has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') anon_any, has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') user_any,
  has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') service_write
FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname LIKE 'data_entry_assistant_%_333' ORDER BY 1;
SELECT p.oid::regprocedure, prosecdef, proconfig, proacl::text, md5(prosrc) source_md5,
  has_function_privilege('anon', p.oid, 'EXECUTE') anon_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') user_exec
FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND (proname = 'data_entry_assistant_review_333' OR proname LIKE '\_de333\_%') ORDER BY 1;
SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE 'de333_%' ORDER BY 1;
