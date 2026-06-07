-- Tabela principal: Meta Custom Audiences
CREATE TABLE public.meta_custom_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_account_links(id) ON DELETE CASCADE,
  audience_id_meta text,
  name text NOT NULL,
  description text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  total_records_local integer DEFAULT 0,
  total_records_meta integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (company_id, audience_id_meta),
  CHECK (last_sync_status IS NULL OR last_sync_status IN ('ok','partial','error','syncing'))
);

CREATE INDEX meta_custom_audiences_company_idx ON public.meta_custom_audiences(company_id);
CREATE INDEX meta_custom_audiences_enabled_idx ON public.meta_custom_audiences(company_id, enabled) WHERE enabled = true;
CREATE INDEX meta_custom_audiences_meta_id_idx ON public.meta_custom_audiences(audience_id_meta);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_custom_audiences TO authenticated;
GRANT ALL ON public.meta_custom_audiences TO service_role;

ALTER TABLE public.meta_custom_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_custom_audiences_select" ON public.meta_custom_audiences
  FOR SELECT TO authenticated
  USING (
    public.row_belongs_to_current_company(company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'marketing_manager'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
    )
  );

CREATE POLICY "meta_custom_audiences_insert" ON public.meta_custom_audiences
  FOR INSERT TO authenticated
  WITH CHECK (
    public.row_belongs_to_current_company(company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'marketing_manager'::app_role)
    )
  );

CREATE POLICY "meta_custom_audiences_update" ON public.meta_custom_audiences
  FOR UPDATE TO authenticated
  USING (
    public.row_belongs_to_current_company(company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'marketing_manager'::app_role)
    )
  )
  WITH CHECK (
    public.row_belongs_to_current_company(company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'marketing_manager'::app_role)
    )
  );

CREATE POLICY "meta_custom_audiences_delete" ON public.meta_custom_audiences
  FOR DELETE TO authenticated
  USING (
    public.row_belongs_to_current_company(company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'marketing_manager'::app_role)
    )
  );

CREATE TRIGGER meta_custom_audiences_set_updated_at
  BEFORE UPDATE ON public.meta_custom_audiences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Log de sincronizações
CREATE TABLE public.meta_audience_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id uuid NOT NULL REFERENCES public.meta_custom_audiences(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  records_processed integer DEFAULT 0,
  status text NOT NULL DEFAULT 'started',
  error_message text,
  meta_response jsonb,
  CHECK (status IN ('started','ok','partial','error'))
);

CREATE INDEX meta_audience_sync_log_audience_idx ON public.meta_audience_sync_log(audience_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.meta_audience_sync_log TO authenticated;
GRANT ALL ON public.meta_audience_sync_log TO service_role;

ALTER TABLE public.meta_audience_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_audience_sync_log_select" ON public.meta_audience_sync_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meta_custom_audiences a
      WHERE a.id = meta_audience_sync_log.audience_id
        AND public.row_belongs_to_current_company(a.company_id)
        AND (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'marketing_manager'::app_role)
          OR public.has_role(auth.uid(), 'manager'::app_role)
        )
    )
  );

CREATE POLICY "meta_audience_sync_log_insert" ON public.meta_audience_sync_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meta_custom_audiences a
      WHERE a.id = meta_audience_sync_log.audience_id
        AND public.row_belongs_to_current_company(a.company_id)
        AND (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'marketing_manager'::app_role)
        )
    )
  );

-- Dashboard RPC
CREATE OR REPLACE FUNCTION public.crm_meta_audiences_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_result jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'marketing_manager'::app_role)
    OR public.has_role(v_uid, 'platform_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden: requires admin or marketing_manager';
  END IF;

  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'no_active_company';
  END IF;

  WITH audiences AS (
    SELECT
      a.id, a.name, a.description, a.audience_id_meta, a.enabled,
      a.connection_id, a.last_synced_at, a.last_sync_status, a.last_sync_error,
      a.total_records_local, a.total_records_meta, a.created_at, a.updated_at,
      l.ad_account_id, l.display_label AS ad_account_label,
      (SELECT row_to_json(s.*) FROM (
        SELECT id, started_at, finished_at, status, records_processed, error_message
        FROM public.meta_audience_sync_log
        WHERE audience_id = a.id
        ORDER BY started_at DESC LIMIT 1
      ) s) AS last_sync
    FROM public.meta_custom_audiences a
    JOIN crm.ad_platform_account_links l ON l.id = a.connection_id
    WHERE a.company_id = v_company_id
    ORDER BY a.created_at DESC
  ),
  stats AS (
    SELECT
      (SELECT count(*) FROM public.meta_custom_audiences WHERE company_id = v_company_id) AS total_audiences,
      (SELECT count(*) FROM public.meta_custom_audiences WHERE company_id = v_company_id AND enabled) AS enabled_audiences,
      (SELECT count(*) FROM public.meta_custom_audiences WHERE company_id = v_company_id AND last_sync_status = 'error') AS error_audiences,
      (SELECT coalesce(sum(records_processed), 0) FROM public.meta_audience_sync_log s
        JOIN public.meta_custom_audiences a ON a.id = s.audience_id
        WHERE a.company_id = v_company_id AND s.status IN ('ok','partial')
          AND s.started_at >= now() - interval '30 days') AS records_synced_30d,
      (SELECT count(*) FROM public.meta_custom_audiences
        WHERE company_id = v_company_id AND enabled
          AND (last_synced_at IS NULL OR last_synced_at < now() - interval '7 days')) AS stale_audiences
  )
  SELECT jsonb_build_object(
    'company_id', v_company_id,
    'generated_at', now(),
    'stats', (SELECT row_to_json(stats.*) FROM stats),
    'audiences', coalesce((SELECT jsonb_agg(row_to_json(audiences.*)) FROM audiences), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_meta_audiences_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_meta_audiences_dashboard() TO authenticated, service_role;

-- Collect leads for a given audience (applies stored filters; returns raw email+phone)
CREATE OR REPLACE FUNCTION public.crm_meta_audience_collect_leads(p_audience_id uuid)
RETURNS TABLE (email text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_company_id uuid;
  v_filters jsonb;
  v_event_slugs text[];
  v_sources text[];
  v_since_days int;
  v_consent text;
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  -- Allow service_role (cron) or admin/marketing_manager
  IF NOT (
    (SELECT current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
    OR public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'marketing_manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT a.company_id, a.filters
    INTO v_company_id, v_filters
  FROM public.meta_custom_audiences a
  WHERE a.id = p_audience_id;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'audience_not_found'; END IF;

  v_event_slugs := CASE WHEN jsonb_typeof(v_filters->'event_slugs') = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(v_filters->'event_slugs')) ELSE NULL END;
  v_sources := CASE WHEN jsonb_typeof(v_filters->'sources') = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(v_filters->'sources')) ELSE NULL END;
  v_since_days := nullif(v_filters->>'since_days','')::int;
  v_consent := v_filters->>'consent_required';

  RETURN QUERY
  SELECT DISTINCT lc.email, lc.phone
  FROM public.lead_capture lc
  JOIN public.events e ON e.slug = lc.event_slug
  WHERE e.company_id = v_company_id
    AND (lc.email IS NOT NULL OR lc.phone IS NOT NULL)
    AND (v_event_slugs IS NULL OR array_length(v_event_slugs,1) IS NULL OR lc.event_slug = ANY(v_event_slugs))
    AND (v_sources IS NULL OR array_length(v_sources,1) IS NULL OR lc.source = ANY(v_sources))
    AND (v_since_days IS NULL OR lc.created_at >= now() - (v_since_days || ' days')::interval)
    AND (
      v_consent IS NULL OR v_consent = ''
      OR (v_consent = 'email' AND lc.consent_email = true)
      OR (v_consent = 'whatsapp' AND lc.consent_whatsapp = true)
      OR (v_consent = 'any' AND (lc.consent_email = true OR lc.consent_whatsapp = true))
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_meta_audience_collect_leads(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_meta_audience_collect_leads(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.meta_custom_audiences IS
'Meta Custom Audiences ligadas a uma connection OAuth + ad_account_link existente.
Filtros JSONB suportados: {event_slugs: text[], sources: text[], since_days: int, consent_required: "email"|"whatsapp"|"any"|null}.

-- Seeds recomendados (rodar manualmente após criar primeiras connections):
-- INSERT INTO public.meta_custom_audiences (company_id, connection_id, name, description, filters) VALUES
--   (''7c858982-6ccd-47ca-bd65-e0dd3eebf01c'', ''fb1d8e31-f7c8-41e5-b074-138062df6f3a'', ''Leads Ivete 90d'', ''Quem deu lead para Ivete últimos 90 dias'', ''{"event_slugs":["ivete-clareou-2026"],"since_days":90,"consent_required":"email"}''::jsonb),
--   (''7c858982-6ccd-47ca-bd65-e0dd3eebf01c'', ''fb1d8e31-f7c8-41e5-b074-138062df6f3a'', ''Leads Anitta 90d'', ''Quem deu lead para Anitta últimos 90 dias'', ''{"event_slugs":["anitta-eda-2026"],"since_days":90,"consent_required":"email"}''::jsonb),
--   (''7c858982-6ccd-47ca-bd65-e0dd3eebf01c'', ''fb1d8e31-f7c8-41e5-b074-138062df6f3a'', ''Leads MP All 180d'', ''Todos os leads MP últimos 180 dias'', ''{"since_days":180,"consent_required":"email"}''::jsonb);';