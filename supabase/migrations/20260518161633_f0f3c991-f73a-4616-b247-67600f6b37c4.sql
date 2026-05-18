
-- 1. Tabela de auditoria de sugestões IA
CREATE TABLE IF NOT EXISTS public.coala_ai_classification_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid REFERENCES auth.users(id),
  ai_response_raw jsonb NOT NULL,
  top_candidate_code text,
  top_candidate_id uuid REFERENCES public.account_categories(id),
  top_confidence numeric,
  bp_l2_filter_applied boolean DEFAULT false,
  applied_auto boolean NOT NULL DEFAULT false,
  applied_at timestamptz,
  applied_by uuid REFERENCES auth.users(id),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coala_ai_sug_tx
  ON public.coala_ai_classification_suggestions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_coala_ai_sug_pending
  ON public.coala_ai_classification_suggestions(company_id, requested_at DESC)
  WHERE applied_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.coala_ai_classification_suggestions ENABLE ROW LEVEL SECURITY;

-- SELECT: members of company
CREATE POLICY coala_ai_sug_select ON public.coala_ai_classification_suggestions
  FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
  );

-- INSERT/UPDATE: admin/manager/editor of company (edge function uses service_role and bypasses)
CREATE POLICY coala_ai_sug_insert ON public.coala_ai_classification_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.current_company_id()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'editor'::app_role)
      OR public.has_role(auth.uid(), 'platform_admin'::app_role)
    )
  );

CREATE POLICY coala_ai_sug_update ON public.coala_ai_classification_suggestions
  FOR UPDATE TO authenticated
  USING (
    company_id = public.current_company_id()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'editor'::app_role)
      OR public.has_role(auth.uid(), 'platform_admin'::app_role)
    )
  );

-- 2. Estender set_coala_match_source para aceitar 'ai_classifier'
CREATE OR REPLACE FUNCTION public.set_coala_match_source(source text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF source NOT IN ('inline_edit','audit_ia','manual','wizard','ai_classifier') THEN
    RAISE EXCEPTION 'invalid source %', source;
  END IF;
  PERFORM set_config('app.coala_match_source', source, true);
END $$;
