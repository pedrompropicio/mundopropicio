-- Verificação nova: cron.job_run_details sem purga (incidente 19/09/2026)
INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES (
  'cron_run_details_sem_purga',
  'Execuções em cron.job_run_details com end_time há mais de 8 dias (a purga diária retém 7 dias). Se subir, a purga morreu.',
  'warn', 'global', 0,
  'Job de purga em Live: cron-purge-run-details, jobid 262, 15 3 * * *. Criado a 19/09/2026 depois do incidente em que a tabela tinha 3.549 MB / ~3,06 M linhas e derrubou a base (HTTP 522). Nunca consultar cron.job_run_details sem intervalo de runid (PK).'
)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      severity = EXCLUDED.severity,
      scope = EXCLUDED.scope,
      notes = EXCLUDED.notes;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_infra()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  cR bigint; sR jsonb;
BEGIN
  SELECT count(*) INTO cR
    FROM cron.job_run_details d
   WHERE d.end_time < now() - interval '8 days';

  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO sR
    FROM (
      SELECT d.jobid, d.runid, d.status, d.end_time
        FROM cron.job_run_details d
       WHERE d.end_time < now() - interval '8 days'
       ORDER BY d.end_time
       LIMIT 5
    ) x;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cR, i.reference_count, (cR = i.reference_count) AS conforme,
         i.notes, sR
    FROM public.system_invariants i
   WHERE i.name = 'cron_run_details_sem_purga';
END;
$function$;

REVOKE ALL ON FUNCTION public._run_invariant_checks_infra() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._run_invariant_checks_infra() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT * FROM public._run_invariant_checks_raw()
  UNION ALL
  SELECT * FROM public._run_invariant_checks_extra()
  UNION ALL
  SELECT * FROM public._run_invariant_checks_secrets()
  UNION ALL
  SELECT * FROM public._run_invariant_checks_infra()
$function$;