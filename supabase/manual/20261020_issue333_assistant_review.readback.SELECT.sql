-- #333 fase12c readback SELECT-only, após aplicação separadamente autorizada.
SELECT enabled FROM public.data_entry_assistant_review_settings_333;
SELECT (SELECT count(*) FROM public.data_entry_assistant_reviews_333) reviews, (SELECT count(*) FROM public.data_entry_assistant_authorizations_333) authorizations;
SELECT c.relname, c.relrowsecurity, c.relacl::text acl,
  has_table_privilege('anon', c.oid, 'SELECT') anon_select, has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') user_any
FROM pg_class c WHERE c.relname LIKE 'data_entry_assistant_%_333' ORDER BY 1;
SELECT proname, prosecdef, proconfig, proacl::text, md5(prosrc) source_md5,
  has_function_privilege('anon', oid, 'EXECUTE') anon_exec, has_function_privilege('authenticated', oid, 'EXECUTE') user_exec
FROM pg_proc WHERE oid = 'public.data_entry_assistant_review_333(text,uuid,integer,text,jsonb,text[],uuid)'::regprocedure;
