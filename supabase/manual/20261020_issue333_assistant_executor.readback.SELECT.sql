-- #333 fase12f readback SELECT-only (antes/depois da aplicação autorizada e no fecho da janela).
SELECT enabled FROM public.data_entry_assistant_executor_settings_333;
SELECT action_id, count(*) FROM public.data_entry_assistant_executions_333 GROUP BY 1 ORDER BY 1;
SELECT c.relname, c.relrowsecurity, c.relacl::text acl,
  has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') anon_any, has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') user_any,
  has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') service_write
FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('data_entry_assistant_executor_settings_333','data_entry_assistant_executions_333') ORDER BY 1;
SELECT p.oid::regprocedure, prosecdef, proconfig, proacl::text, md5(prosrc) source_md5,
  has_function_privilege('anon', p.oid, 'EXECUTE') anon_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') user_exec, has_function_privilege('service_role', p.oid, 'EXECUTE') service_exec
FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND proname IN ('data_entry_assistant_execute_333', '_de333_closing_check', '_de333_cents', '_de333_req') ORDER BY 1;
SELECT tgname FROM pg_trigger WHERE tgname LIKE 'de333_exec_%' ORDER BY 1;
-- Writers canónicos chamados pelo executor: md5 tem de ser igual ao provado em canon12f (canon12f-functions.md5.txt).
SELECT p.oid::regprocedure, md5(prosrc) FROM pg_proc p WHERE p.oid IN ('public.confirm_ticket_office_statement(uuid)'::regprocedure, 'public.save_ticket_office_settlement(uuid,jsonb,boolean,jsonb,jsonb,text,text,text)'::regprocedure,
  'public.create_settlement_transfer(uuid,uuid,uuid,numeric,date,boolean)'::regprocedure, 'public.materialize_paid_amount_payment()'::regprocedure, 'public._derive_paid_amount(uuid)'::regprocedure,
  'public.guard_paid_amount_vs_payments()'::regprocedure, 'public.validate_installments_total()'::regprocedure) ORDER BY 1;
SELECT count(*) AS triggers_transactions_payments FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.transactions'::regclass, 'public.transaction_payments'::regclass);
