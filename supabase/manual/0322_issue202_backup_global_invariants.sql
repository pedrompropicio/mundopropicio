-- 0322 — #202 E2b: backup global retomável e observabilidade das corridas.
-- Autorização Pedro 6621085645 (04/11/2026), âmbito 1–5 de 6621065049, válida até 2026-11-14.
-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Executor: Codex E2b. Aplicação, deploy e limpeza: janela do 0.
-- Sem alterações a backup_runs; edge independente desta preparação.
-- Invariantes: global running > 2 h; global sem ok nas últimas 30 h (referência 0).
-- Exclusão deliberada do nonce OAuth efémero da #333; não alarga a ACL restrita da 0206/0207.
-- O agregador conserva integralmente os 22 SELECT da 0214 e acrescenta só o backup.
-- A guarda aborta a transação se o catálogo divergir do corpo autorizado.
-- Rollback: supabase/manual/rollback_0322_issue202_backup_global_invariants_comentado.sql

BEGIN;

DO $guard$
DECLARE definition text; source_body text;
BEGIN
  SELECT pg_get_functiondef('public._run_invariant_checks_all()'::regprocedure), p.prosrc
    INTO definition, source_body FROM pg_catalog.pg_proc p
   WHERE p.oid = 'public._run_invariant_checks_all()'::regprocedure;
  IF (SELECT count(*) FROM regexp_matches(definition, '\mUNION\s+ALL\M', 'gi')) <> 21
     OR definition NOT LIKE '%public._run_invariant_checks_cache_contracts()%'
     OR regexp_replace(lower(btrim(source_body)), '\s+', ' ', 'g') <>
        regexp_replace(lower(btrim($expected$
  SELECT * FROM public._run_invariant_checks_raw()
  UNION ALL SELECT * FROM public._run_invariant_checks_extra()
  UNION ALL SELECT * FROM public._run_invariant_checks_paid()
  UNION ALL SELECT * FROM public._run_invariant_checks_secrets()
  UNION ALL SELECT * FROM public._run_invariant_checks_infra()
  UNION ALL SELECT * FROM public._run_invariant_checks_secdef()
  UNION ALL SELECT * FROM public._run_invariant_checks_docs()
  UNION ALL SELECT * FROM public._run_invariant_checks_extrato()
  UNION ALL SELECT * FROM public._run_invariant_checks_cards()
  UNION ALL SELECT * FROM public._run_invariant_checks_tenant()
  UNION ALL SELECT * FROM public._run_invariant_checks_duplicate_invoices()
  UNION ALL SELECT * FROM public._run_invariant_checks_camarim()
  UNION ALL SELECT * FROM public._run_invariant_checks_suppliers()
  UNION ALL SELECT * FROM public._run_invariant_checks_paid_below_gross()
  UNION ALL SELECT * FROM public._run_invariant_checks_ticketline_series()
  UNION ALL SELECT * FROM public._run_invariant_checks_unreachable_docs()
  UNION ALL SELECT * FROM public._run_invariant_checks_isolation()
  UNION ALL SELECT * FROM public._run_invariant_checks_storage()
  UNION ALL SELECT * FROM public._run_invariant_checks_rateio()
  UNION ALL SELECT * FROM public._run_invariant_checks_cash()
  UNION ALL SELECT * FROM public._run_invariant_checks_dre_nature()
  UNION ALL SELECT * FROM public._run_invariant_checks_cache_contracts()
$expected$)), '\s+', ' ', 'g') THEN
    RAISE EXCEPTION '0322: _run_invariant_checks_all divergente da 0214 (esperados 21 UNION ALL e cache_contracts)';
  END IF;
END;
$guard$;

INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES
 ('backup_global_running_2h', 'Corridas globais running há mais de 2 horas.', 'error', 'global', 0, '#202-c: inclui corridas históricas sem marca'),
 ('backup_global_sem_ok_30h', 'Backup global sem ok nas últimas 30 horas.', 'error', 'global', 0, '#202-c: RPO 24 h, tolerância 6 h')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_backup()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
  WITH stuck AS (
    SELECT br.id, br.run_date, br.started_at, br.folder_path
      FROM public.backup_runs br
     WHERE br.scope = 'global' AND br.status = 'running'
       AND br.started_at < now() - interval '2 hours'
  ), counts AS (
    SELECT 'backup_global_running_2h'::text AS invariant_name,
           (SELECT count(*) FROM stuck) AS n,
           (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
              FROM (SELECT * FROM stuck ORDER BY started_at, id LIMIT 6) s) AS samples
    UNION ALL
    SELECT 'backup_global_sem_ok_30h',
           CASE WHEN EXISTS (SELECT 1 FROM public.backup_runs br WHERE br.scope = 'global'
             AND br.status = 'ok' AND br.finished_at > now() - interval '30 hours') THEN 0 ELSE 1 END,
           jsonb_build_object('ultimo_ok', (SELECT to_jsonb(s) FROM (
             SELECT br.id, br.run_date, br.started_at, br.folder_path, br.finished_at
               FROM public.backup_runs br WHERE br.scope = 'global' AND br.status = 'ok'
              ORDER BY br.finished_at DESC NULLS LAST, br.id DESC LIMIT 1) s))
  )
  SELECT i.name, i.description, i.severity, i.scope, c.n, i.reference_count,
         c.n <= i.reference_count, i.notes, c.samples
    FROM counts c JOIN public.system_invariants i ON i.name = c.invariant_name
$function$;
REVOKE ALL ON FUNCTION public._run_invariant_checks_backup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_backup() TO service_role;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT * FROM public._run_invariant_checks_raw()
  UNION ALL SELECT * FROM public._run_invariant_checks_extra()
  UNION ALL SELECT * FROM public._run_invariant_checks_paid()
  UNION ALL SELECT * FROM public._run_invariant_checks_secrets()
  UNION ALL SELECT * FROM public._run_invariant_checks_infra()
  UNION ALL SELECT * FROM public._run_invariant_checks_secdef()
  UNION ALL SELECT * FROM public._run_invariant_checks_docs()
  UNION ALL SELECT * FROM public._run_invariant_checks_extrato()
  UNION ALL SELECT * FROM public._run_invariant_checks_cards()
  UNION ALL SELECT * FROM public._run_invariant_checks_tenant()
  UNION ALL SELECT * FROM public._run_invariant_checks_duplicate_invoices()
  UNION ALL SELECT * FROM public._run_invariant_checks_camarim()
  UNION ALL SELECT * FROM public._run_invariant_checks_suppliers()
  UNION ALL SELECT * FROM public._run_invariant_checks_paid_below_gross()
  UNION ALL SELECT * FROM public._run_invariant_checks_ticketline_series()
  UNION ALL SELECT * FROM public._run_invariant_checks_unreachable_docs()
  UNION ALL SELECT * FROM public._run_invariant_checks_isolation()
  UNION ALL SELECT * FROM public._run_invariant_checks_storage()
  UNION ALL SELECT * FROM public._run_invariant_checks_rateio()
  UNION ALL SELECT * FROM public._run_invariant_checks_cash()
  UNION ALL SELECT * FROM public._run_invariant_checks_dre_nature()
  UNION ALL SELECT * FROM public._run_invariant_checks_cache_contracts()
  UNION ALL SELECT * FROM public._run_invariant_checks_backup()
$function$;

INSERT INTO public.backup_excluded_tables (schema_name, table_name, reason)
VALUES ('public', 'data_entry_gmail_pending',
        '#333: nonce OAuth efémero (expira em <= 15 min). ACL deliberada 0206/0207: service_role lê só nonce_sha256, expires_at, user_id, company_id, sem created_at; select=* falha 42501. Sem valor de restauro.')
ON CONFLICT (schema_name, table_name) DO NOTHING;
UPDATE public.system_invariants SET reference_count = 3
 WHERE name = 'backup_tabelas_excluidas' AND reference_count = 2;

COMMIT;
