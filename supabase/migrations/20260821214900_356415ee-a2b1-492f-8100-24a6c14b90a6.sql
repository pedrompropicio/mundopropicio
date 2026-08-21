CREATE TABLE IF NOT EXISTS crm.google_campaign_insights_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  customer_id text,
  external_campaign_id text NOT NULL,
  campaign_name text,
  date_start date NOT NULL,
  date_stop date NOT NULL,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  spend_cents bigint NOT NULL DEFAULT 0,
  conversions numeric NOT NULL DEFAULT 0,
  conversions_value_cents bigint NOT NULL DEFAULT 0,
  cpc_cents numeric,
  cpm_cents numeric,
  ctr numeric,
  currency text,
  raw jsonb,
  last_synced_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS google_campaign_insights_daily_uniq
  ON crm.google_campaign_insights_daily (connection_id, external_campaign_id, date_start);
CREATE INDEX IF NOT EXISTS google_campaign_insights_daily_customer_date_idx
  ON crm.google_campaign_insights_daily (customer_id, date_start);
CREATE INDEX IF NOT EXISTS google_campaign_insights_daily_campaign_date_idx
  ON crm.google_campaign_insights_daily (external_campaign_id, date_start);

GRANT USAGE ON SCHEMA crm TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON crm.google_campaign_insights_daily TO authenticated;
GRANT ALL ON crm.google_campaign_insights_daily TO service_role;

ALTER TABLE crm.google_campaign_insights_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON crm.google_campaign_insights_daily;
CREATE POLICY tenant_isolation_select ON crm.google_campaign_insights_daily
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS tenant_isolation_insert ON crm.google_campaign_insights_daily;
CREATE POLICY tenant_isolation_insert ON crm.google_campaign_insights_daily
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS tenant_isolation_update ON crm.google_campaign_insights_daily;
CREATE POLICY tenant_isolation_update ON crm.google_campaign_insights_daily
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS service_role_bypass ON crm.google_campaign_insights_daily;
CREATE POLICY service_role_bypass ON crm.google_campaign_insights_daily
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE crm.google_campaign
  ADD COLUMN IF NOT EXISTS linked_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_event_locked boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS google_campaign_linked_event_idx
  ON crm.google_campaign (linked_event_id);

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS target_roas numeric;

CREATE OR REPLACE FUNCTION crm.auto_link_google_campaigns_to_events(p_company_id uuid)
RETURNS TABLE(updated_count integer, total_active_campaigns integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm', 'public', 'extensions'
AS $function$
DECLARE
  v_updated int := 0;
  v_total int;
BEGIN
  WITH event_tokens AS (
    SELECT
      e.id AS event_id,
      regexp_replace(
        regexp_replace(lower(unaccent(e.name)), '[^a-z0-9\s&]', ' ', 'g'),
        '\s+', ' ', 'g'
      ) AS normalized,
      e.date AS event_date
    FROM public.events e
    WHERE e.company_id = p_company_id
      AND e.status = 'active'
  ),
  campaign_norm AS (
    SELECT
      gc.id AS campaign_id,
      lower(unaccent(regexp_replace(gc.name, '\[[^\]]*\]', ' ', 'g'))) AS clean_name
    FROM crm.google_campaign gc
    WHERE gc.company_id = p_company_id
      AND COALESCE(gc.linked_event_locked, false) = false
  ),
  campaign_matches AS (
    SELECT
      cn.campaign_id,
      et.event_id,
      (SELECT count(*)::int FROM regexp_split_to_table(et.normalized, ' ') AS tok
        WHERE length(tok) >= 4 AND cn.clean_name LIKE '%' || tok || '%') AS score,
      row_number() OVER (
        PARTITION BY cn.campaign_id
        ORDER BY
          (SELECT count(*)::int FROM regexp_split_to_table(et.normalized, ' ') AS tok
            WHERE length(tok) >= 4 AND cn.clean_name LIKE '%' || tok || '%') DESC,
          et.event_date ASC NULLS LAST
      ) AS rk
    FROM campaign_norm cn
    CROSS JOIN event_tokens et
  ),
  best_match AS (
    SELECT campaign_id, event_id, score
    FROM campaign_matches
    WHERE rk = 1 AND score >= 2
  )
  UPDATE crm.google_campaign gc
  SET linked_event_id = bm.event_id
  FROM best_match bm
  WHERE gc.id = bm.campaign_id
    AND (gc.linked_event_id IS DISTINCT FROM bm.event_id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT count(*) INTO v_total
  FROM crm.google_campaign
  WHERE company_id = p_company_id AND status = 'ENABLED';

  RETURN QUERY SELECT v_updated, v_total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_auto_link_google_campaigns_to_events(p_company_id uuid)
RETURNS TABLE(updated_count integer, total_active_campaigns integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'crm', 'extensions'
AS $function$
  SELECT * FROM crm.auto_link_google_campaigns_to_events(p_company_id);
$function$;

REVOKE ALL ON FUNCTION public.crm_auto_link_google_campaigns_to_events(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_auto_link_google_campaigns_to_events(uuid) TO authenticated, service_role;