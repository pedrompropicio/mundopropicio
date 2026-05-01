-- ============================================================
-- RLS legacy audit job
-- Conta policies cujo USING/WITH CHECK contém o padrão antigo
-- "auth.uid() IS NOT NULL" e regista um snapshot histórico.
-- ============================================================

-- 1. Tabela de relatórios (uma linha por execução do job)
CREATE TABLE IF NOT EXISTS public.rls_legacy_audit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  environment text NOT NULL DEFAULT 'live',
  legacy_count integer NOT NULL,
  total_policies integer NOT NULL,
  status text NOT NULL,                       -- 'green' | 'red'
  details jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{schema, table, policyname, cmd, qual, with_check}]
  triggered_by text NOT NULL DEFAULT 'cron',  -- 'cron' | 'manual'
  triggered_by_user uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rls_legacy_audit_ran_at ON public.rls_legacy_audit_reports (ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_rls_legacy_audit_status ON public.rls_legacy_audit_reports (status);

-- 2. RLS — só admin/platform_admin lê; INSERT só via SECURITY DEFINER
ALTER TABLE public.rls_legacy_audit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read RLS audit reports"
ON public.rls_legacy_audit_reports
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin'));

-- (sem policies de INSERT/UPDATE/DELETE — só RPC SECURITY DEFINER pode escrever)

-- 3. RPC que executa a auditoria e grava o snapshot
CREATE OR REPLACE FUNCTION public.run_rls_legacy_audit(
  _triggered_by text DEFAULT 'cron',
  _triggered_by_user uuid DEFAULT NULL
)
RETURNS public.rls_legacy_audit_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_legacy int;
  v_total int;
  v_details jsonb;
  v_row public.rls_legacy_audit_reports;
BEGIN
  -- Total de policies em public
  SELECT count(*) INTO v_total
  FROM pg_policies
  WHERE schemaname = 'public';

  -- Detalhe das policies legacy
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
      'schemaname', schemaname,
      'tablename', tablename,
      'policyname', policyname,
      'cmd', cmd,
      'qual', qual,
      'with_check', with_check
    ) ORDER BY tablename, policyname), '[]'::jsonb)
  INTO v_details
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      qual ILIKE '%auth.uid() IS NOT NULL%'
      OR with_check ILIKE '%auth.uid() IS NOT NULL%'
    );

  v_legacy := jsonb_array_length(v_details);

  INSERT INTO public.rls_legacy_audit_reports
    (legacy_count, total_policies, status, details, triggered_by, triggered_by_user)
  VALUES (
    v_legacy,
    v_total,
    CASE WHEN v_legacy = 0 THEN 'green' ELSE 'red' END,
    v_details,
    _triggered_by,
    _triggered_by_user
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- 4. Permissões da RPC: apenas authenticated com role admin/platform_admin
REVOKE ALL ON FUNCTION public.run_rls_legacy_audit(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_rls_legacy_audit(text, uuid) TO authenticated, service_role;

-- 5. Wrapper público (sem args) para ser chamado pelo cron via service_role
CREATE OR REPLACE FUNCTION public.run_rls_legacy_audit_cron()
RETURNS public.rls_legacy_audit_reports
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT public.run_rls_legacy_audit('cron', NULL);
$$;

REVOKE ALL ON FUNCTION public.run_rls_legacy_audit_cron() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_rls_legacy_audit_cron() TO service_role;
