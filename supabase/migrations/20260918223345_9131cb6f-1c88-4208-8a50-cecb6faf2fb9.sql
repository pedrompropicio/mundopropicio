CREATE TABLE IF NOT EXISTS public.secret_expirations (
  name text PRIMARY KEY,
  lives_in text NOT NULL CHECK (lives_in IN ('edge_function_secret','vault','external')),
  expires_at date,
  owner text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.secret_expirations IS 'Registo dos prazos de segredos (edge functions, vault, externos). Alimenta o invariante segredos_a_expirar_14d. Só service_role.';

GRANT ALL ON public.secret_expirations TO service_role;

ALTER TABLE public.secret_expirations ENABLE ROW LEVEL SECURITY;
-- Sem políticas: RLS ligada sem política = negar tudo a anon/authenticated.

INSERT INTO public.secret_expirations (name, lives_in, expires_at, owner, notes)
VALUES
  ('GITHUB_TOKEN','edge_function_secret',NULL,'Pedro','PAT sem expiração, renovado 18/09/2026, #15'),
  ('META_TOKEN_IVETE','external','2026-10-08','Pedro','Token Meta da conta da Ivete; ver #36')
ON CONFLICT (name) DO UPDATE
  SET lives_in = EXCLUDED.lives_in,
      expires_at = EXCLUDED.expires_at,
      owner = EXCLUDED.owner,
      notes = EXCLUDED.notes,
      updated_at = now();

INSERT INTO public.system_invariants
  (name, description, severity, scope, reference_count, notes)
VALUES (
  'segredos_a_expirar_14d',
  'Segredos com prazo a expirar nos próximos 14 dias (public.secret_expirations).',
  'warn',
  'global',
  0,
  '#15 (2026-09-18): prazos de segredos vivem em secret_expirations; expires_at NULL = sem prazo.'
)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      severity = EXCLUDED.severity,
      scope = EXCLUDED.scope,
      reference_count = EXCLUDED.reference_count,
      notes = EXCLUDED.notes;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_secrets()
RETURNS TABLE(name text, description text, severity text, scope text,
              current_count bigint, reference_count bigint, conforme boolean,
              notes text, sample jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  cS bigint; sS jsonb;
BEGIN
  WITH bad AS (
    SELECT s.name, s.lives_in, s.expires_at, s.owner, s.notes
      FROM public.secret_expirations s
     WHERE s.expires_at IS NOT NULL
       AND s.expires_at <= current_date + 14
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY expires_at LIMIT 6) x), '[]'::jsonb)
    INTO cS, sS FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cS, i.reference_count, (cS = i.reference_count) AS conforme,
         i.notes, sS
    FROM public.system_invariants i
   WHERE i.name = 'segredos_a_expirar_14d';
END;
$function$;

REVOKE ALL ON FUNCTION public._run_invariant_checks_secrets() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._run_invariant_checks_secrets() FROM anon;
REVOKE ALL ON FUNCTION public._run_invariant_checks_secrets() FROM authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_secrets() TO service_role;

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
  UNION ALL
  SELECT * FROM public._run_invariant_checks_secrets()
$function$;

REVOKE ALL ON FUNCTION public._run_invariant_checks_all() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._run_invariant_checks_all() FROM anon;
REVOKE ALL ON FUNCTION public._run_invariant_checks_all() FROM authenticated;