
CREATE TABLE public.meta_campaign_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  ad_account_id text NOT NULL,
  external_campaign_id text NULL,
  external_adset_id text NULL,
  recommendation_type text NOT NULL,
  body text NULL,
  lift_estimate text NULL,
  opportunity_score_lift numeric NULL,
  recommendation_stage text NULL,
  recommendation_time timestamptz NULL,
  url text NULL,
  raw jsonb NULL,
  status text NOT NULL DEFAULT 'nova',
  decided_at timestamptz NULL,
  decided_by uuid NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- chave estável p/ dedup quando external_adset_id é NULL (recomendação só de conta)
  dedupe_object_key text GENERATED ALWAYS AS (COALESCE(external_adset_id, '__account__')) STORED,
  CONSTRAINT meta_campaign_recommendations_status_chk
    CHECK (status IN ('nova','ignorada','aplicada'))
);

CREATE UNIQUE INDEX meta_campaign_recommendations_dedupe_uq
  ON public.meta_campaign_recommendations
  (company_id, ad_account_id, dedupe_object_key, recommendation_type);

CREATE INDEX meta_campaign_recommendations_company_idx
  ON public.meta_campaign_recommendations (company_id);
CREATE INDEX meta_campaign_recommendations_campaign_idx
  ON public.meta_campaign_recommendations (external_campaign_id)
  WHERE external_campaign_id IS NOT NULL;
CREATE INDEX meta_campaign_recommendations_adset_idx
  ON public.meta_campaign_recommendations (external_adset_id)
  WHERE external_adset_id IS NOT NULL;
CREATE INDEX meta_campaign_recommendations_status_idx
  ON public.meta_campaign_recommendations (company_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_campaign_recommendations TO authenticated;
GRANT ALL ON public.meta_campaign_recommendations TO service_role;

ALTER TABLE public.meta_campaign_recommendations ENABLE ROW LEVEL SECURITY;

-- Leitura: membros da empresa (mesmo padrão multi-tenant do projecto)
CREATE POLICY "tenant members can read recommendations"
  ON public.meta_campaign_recommendations
  FOR SELECT TO authenticated
  USING (public.row_belongs_to_current_company(company_id));

-- Decisão (apply/ignore): admin/manager/marketing_manager da empresa
CREATE POLICY "tenant managers can update recommendations"
  ON public.meta_campaign_recommendations
  FOR UPDATE TO authenticated
  USING (
    public.row_belongs_to_current_company(company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'marketing_manager'::public.app_role)
      OR public.has_role(auth.uid(), 'platform_admin'::public.app_role)
    )
  )
  WITH CHECK (public.row_belongs_to_current_company(company_id));

-- INSERT/DELETE só via service_role (edge function). Nenhuma policy para anon/authenticated.

CREATE TRIGGER update_meta_campaign_recommendations_updated_at
  BEFORE UPDATE ON public.meta_campaign_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.meta_campaign_recommendations IS
  'Recomendações vivas da Meta Graph (/act_<id>/recommendations) explodidas por object_id (1 linha por adset afetado). Persistidas pela edge crm-meta-recommendations; estado de decisão (nova/ignorada/aplicada) preservado entre re-syncs.';
