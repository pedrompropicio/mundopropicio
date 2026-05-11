-- Meta Campaigns Dashboard: event linkage, currency, daily insights
-- Idempotent — already applied in production via MCP; versioned here for drift correction.

ALTER TABLE crm.meta_campaign_snapshot
  ADD COLUMN IF NOT EXISTS linked_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE crm.meta_campaign_snapshot
  ADD COLUMN IF NOT EXISTS linked_event_locked boolean DEFAULT false;
ALTER TABLE crm.meta_campaign_snapshot
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR';

ALTER TABLE crm.ad_platform_connections
  ADD COLUMN IF NOT EXISTS selected_ad_account_currency text;

CREATE INDEX IF NOT EXISTS idx_snapshot_linked_event
  ON crm.meta_campaign_snapshot(linked_event_id)
  WHERE linked_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm.meta_campaign_insights_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  ad_account_id text NOT NULL,
  external_campaign_id text NOT NULL,
  date_start date NOT NULL,
  impressions bigint,
  reach bigint,
  frequency numeric,
  clicks bigint,
  unique_clicks bigint,
  spend_cents bigint,
  cpc_cents numeric,
  cpm_cents numeric,
  cpp_cents numeric,
  ctr numeric,
  unique_ctr numeric,
  purchases_count integer DEFAULT 0,
  purchases_value_cents bigint DEFAULT 0,
  leads_count integer DEFAULT 0,
  add_to_cart_count integer DEFAULT 0,
  initiate_checkout_count integer DEFAULT 0,
  view_content_count integer DEFAULT 0,
  roas numeric,
  currency text DEFAULT 'EUR',
  raw jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_campaign_id, date_start)
);

ALTER TABLE crm.meta_campaign_insights_daily ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR';
ALTER TABLE crm.meta_campaign_insights_daily ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_insights_company_date
  ON crm.meta_campaign_insights_daily(company_id, date_start DESC);
CREATE INDEX IF NOT EXISTS idx_insights_campaign_date
  ON crm.meta_campaign_insights_daily(external_campaign_id, date_start DESC);
CREATE INDEX IF NOT EXISTS idx_insights_synced
  ON crm.meta_campaign_insights_daily(last_synced_at DESC);

DROP POLICY IF EXISTS tenant_isolation_select ON crm.meta_campaign_insights_daily;
DROP POLICY IF EXISTS tenant_isolation_insert ON crm.meta_campaign_insights_daily;
DROP POLICY IF EXISTS tenant_isolation_update ON crm.meta_campaign_insights_daily;

CREATE POLICY tenant_isolation_select ON crm.meta_campaign_insights_daily
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY tenant_isolation_insert ON crm.meta_campaign_insights_daily
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY tenant_isolation_update ON crm.meta_campaign_insights_daily
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

GRANT USAGE ON SCHEMA crm TO authenticated;
GRANT SELECT, INSERT, UPDATE ON crm.meta_campaign_insights_daily TO authenticated;

CREATE OR REPLACE FUNCTION crm.auto_link_meta_campaigns_to_events(p_company_id uuid)
RETURNS TABLE (updated_count integer, total_active_campaigns integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, crm, extensions
AS $$
DECLARE
  v_updated integer := 0;
  v_total integer := 0;
  r record;
  best_event uuid;
BEGIN
  SELECT count(*) INTO v_total
  FROM crm.meta_campaign_snapshot s
  WHERE s.company_id = p_company_id
    AND s.status = 'ACTIVE'
    AND COALESCE(s.linked_event_locked, false) = false;

  FOR r IN
    SELECT s.id, s.name
    FROM crm.meta_campaign_snapshot s
    WHERE s.company_id = p_company_id
      AND s.status = 'ACTIVE'
      AND COALESCE(s.linked_event_locked, false) = false
  LOOP
    WITH norm AS (
      SELECT lower(unaccent(r.name)) AS cname
    ),
    tokens AS (
      SELECT DISTINCT t
      FROM norm,
           regexp_split_to_table(cname, '[^a-z0-9]+') AS t
      WHERE length(t) >= 4
    ),
    matches AS (
      SELECT e.id,
             e.event_date,
             count(*) AS hits
      FROM public.events e, tokens
      WHERE e.company_id = p_company_id
        AND e.status IN ('active','confirmed','planning')
        AND lower(unaccent(coalesce(e.name,''))) LIKE '%' || tokens.t || '%'
      GROUP BY e.id, e.event_date
    )
    SELECT id INTO best_event
    FROM matches
    ORDER BY hits DESC,
             (event_date >= CURRENT_DATE) DESC,
             abs(extract(epoch FROM (event_date - CURRENT_DATE)))::bigint ASC
    LIMIT 1;

    IF best_event IS NOT NULL THEN
      UPDATE crm.meta_campaign_snapshot
         SET linked_event_id = best_event
       WHERE id = r.id
         AND COALESCE(linked_event_locked,false) = false
         AND (linked_event_id IS DISTINCT FROM best_event);
      IF FOUND THEN v_updated := v_updated + 1; END IF;
    END IF;
    best_event := NULL;
  END LOOP;

  RETURN QUERY SELECT v_updated, v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_auto_link_meta_campaigns_to_events(p_company_id uuid)
RETURNS TABLE (updated_count integer, total_active_campaigns integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, crm
AS $$
  SELECT * FROM crm.auto_link_meta_campaigns_to_events(p_company_id);
$$;

GRANT EXECUTE ON FUNCTION public.crm_auto_link_meta_campaigns_to_events(uuid) TO authenticated;
