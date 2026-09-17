CREATE TABLE IF NOT EXISTS public.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  scope text NOT NULL CHECK (scope IN ('company','global')),
  company_id uuid NULL REFERENCES public.companies(id),
  slug text NULL,
  file_name text NULL,
  status text NOT NULL CHECK (status IN ('running','ok','error')),
  tables_count int NULL,
  rows_total bigint NULL,
  bytes bigint NULL,
  error_text text NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS backup_runs_ok_unico_por_dia_alvo
  ON public.backup_runs (
    run_date, scope,
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) WHERE status = 'ok';

CREATE INDEX IF NOT EXISTS backup_runs_finished_at_idx
  ON public.backup_runs (finished_at DESC);

GRANT SELECT ON public.backup_runs TO authenticated;
GRANT ALL ON public.backup_runs TO service_role;

ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backup_runs_select_admin ON public.backup_runs;
CREATE POLICY backup_runs_select_admin
  ON public.backup_runs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'platform_admin')
  );

DROP POLICY IF EXISTS company_isolation_backup_runs ON public.backup_runs;
CREATE POLICY company_isolation_backup_runs
  ON public.backup_runs AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    (company_id IS NOT NULL AND public.row_belongs_to_current_company(company_id))
    OR (company_id IS NULL AND public.has_role(auth.uid(), 'platform_admin'))
  );

INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES (
  'backup_empresa_em_falta',
  'Empresas ativas (mais o global) sem backup com status ok nas últimas 30 horas',
  'error', 'global', 0,
  'Conta-se por backup_runs, nao pelo storage. Uma invocacao da database-backup = um alvo.'
)
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()
RETURNS TABLE(name text, description text, severity text, scope text,
              current_count bigint, reference_count bigint, conforme boolean,
              notes text, sample jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  cB bigint; sB jsonb;
BEGIN
  WITH em_falta AS (
    SELECT c.id AS company_id, c.slug,
           (SELECT max(b.finished_at) FROM public.backup_runs b
             WHERE b.company_id = c.id AND b.status = 'ok') AS ultimo_ok
      FROM public.companies c
     WHERE c.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM public.backup_runs b
          WHERE b.company_id = c.id
            AND b.status = 'ok'
            AND b.finished_at > now() - interval '30 hours'
       )
  ),
  global_falta AS (
    SELECT NULL::uuid AS company_id, 'global'::text AS slug,
           (SELECT max(b.finished_at) FROM public.backup_runs b
             WHERE b.scope = 'global' AND b.status = 'ok') AS ultimo_ok
     WHERE NOT EXISTS (
       SELECT 1 FROM public.backup_runs b
        WHERE b.scope = 'global'
          AND b.status = 'ok'
          AND b.finished_at > now() - interval '30 hours'
     )
  ),
  bad AS (
    SELECT * FROM em_falta
    UNION ALL
    SELECT * FROM global_falta
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 6) x), '[]'::jsonb)
    INTO cB, sB FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cB, i.reference_count, (cB = i.reference_count) AS conforme,
         i.notes, sB
    FROM public.system_invariants i
   WHERE i.name = 'backup_empresa_em_falta';
END;
$function$;

REVOKE ALL ON FUNCTION public._run_invariant_checks_extra() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._run_invariant_checks_extra() FROM anon;
REVOKE ALL ON FUNCTION public._run_invariant_checks_extra() FROM authenticated;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()
RETURNS TABLE(name text, description text, severity text, scope text,
              current_count bigint, reference_count bigint, conforme boolean,
              notes text, sample jsonb)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT * FROM public._run_invariant_checks_raw()
  UNION ALL
  SELECT * FROM public._run_invariant_checks_extra()
$function$;

REVOKE ALL ON FUNCTION public._run_invariant_checks_all() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._run_invariant_checks_all() FROM anon;
REVOKE ALL ON FUNCTION public._run_invariant_checks_all() FROM authenticated;

CREATE OR REPLACE FUNCTION public.run_invariant_checks()
RETURNS TABLE(name text, description text, severity text, scope text,
              current_count bigint, reference_count bigint, conforme boolean,
              notes text, sample jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Sem permissao para correr o verificador de invariantes';
  END IF;
  RETURN QUERY
    SELECT * FROM public._run_invariant_checks_all() r
     ORDER BY r.scope, r.conforme, r.severity, r.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_invariant_checks_and_log()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_rows jsonb;
  v_drift integer;
  v_run_id uuid;
  v_lines text;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Sem permissao para correr o verificador de invariantes';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'name', r.name, 'description', r.description, 'severity', r.severity,
           'scope', r.scope, 'current_count', r.current_count,
           'reference_count', r.reference_count, 'conforme', r.conforme)), '[]'::jsonb)
    INTO v_rows
    FROM public._run_invariant_checks_all() r;

  SELECT count(*) INTO v_drift
    FROM jsonb_array_elements(v_rows) e
   WHERE (e->>'conforme')::boolean IS FALSE;

  INSERT INTO public.invariant_runs (ran_by, drift_count, results)
  VALUES (auth.uid(), v_drift, v_rows)
  RETURNING id INTO v_run_id;

  IF v_drift > 0 THEN
    SELECT string_agg(
             format('- %s [%s]: %s (referencia %s)', e->>'name', e->>'scope', e->>'current_count', e->>'reference_count'),
             chr(10) ORDER BY e->>'name')
      INTO v_lines
      FROM jsonb_array_elements(v_rows) e
     WHERE (e->>'conforme')::boolean IS FALSE;

    INSERT INTO public.system_reminders (key, title, message, due_date, frequency, link_url, is_active)
    VALUES (
      'invariant_drift',
      'Verificador de invariantes: ' || v_drift || ' verificacao(oes) fora da referencia',
      v_lines,
      CURRENT_DATE,
      'daily',
      'https://mpgestaoeventos.com/admin/invariantes',
      true
    )
    ON CONFLICT (key) DO UPDATE SET
      title = EXCLUDED.title,
      message = EXCLUDED.message,
      due_date = CURRENT_DATE,
      is_active = true,
      completed_at = NULL,
      updated_at = now();
  ELSE
    UPDATE public.system_reminders
       SET is_active = false, completed_at = now(), updated_at = now()
     WHERE key = 'invariant_drift' AND completed_at IS NULL;
  END IF;

  RETURN v_run_id;
END;
$function$;