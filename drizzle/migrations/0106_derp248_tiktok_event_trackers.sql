-- D-ERP248 — TikTok Ads por evento: event_trackers, campanha→evento, partilha da conta, faturas TikTok.

-- 1) event_trackers
CREATE TABLE public.event_trackers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta','google','tiktok')),
  tracker_id text NOT NULL CHECK (btrim(tracker_id) <> ''),
  tracker_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_trackers_event_platform_tracker_key UNIQUE (event_id, platform, tracker_id)
);
CREATE INDEX idx_event_trackers_event ON public.event_trackers(event_id, platform);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_trackers TO authenticated;
GRANT ALL ON public.event_trackers TO service_role;
ALTER TABLE public.event_trackers ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_trackers_select ON public.event_trackers FOR SELECT TO authenticated USING (true);
CREATE POLICY event_trackers_write ON public.event_trackers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'marketing_manager') OR public.has_role(auth.uid(),'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'marketing_manager') OR public.has_role(auth.uid(),'platform_admin'));
CREATE POLICY company_isolation_event_trackers ON public.event_trackers AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE OR REPLACE FUNCTION public.event_trackers_sync_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT e.company_id INTO NEW.company_id FROM public.events e WHERE e.id = NEW.event_id;
  IF NEW.company_id IS NULL THEN RAISE EXCEPTION 'evento % inexistente', NEW.event_id; END IF;
  NEW.tracker_id := btrim(NEW.tracker_id);
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_event_trackers_sync_company BEFORE INSERT OR UPDATE ON public.event_trackers
  FOR EACH ROW EXECUTE FUNCTION public.event_trackers_sync_company();

INSERT INTO public.event_trackers (company_id, event_id, platform, tracker_id, tracker_metadata)
SELECT e.company_id, e.id, 'meta', btrim(e.meta_pixel_id), jsonb_build_object('custom_event_type','PURCHASE','origem','events.meta_pixel_id')
FROM public.events e
WHERE e.meta_pixel_id IS NOT NULL AND btrim(e.meta_pixel_id) <> '' AND e.company_id IS NOT NULL
ON CONFLICT (event_id, platform, tracker_id) DO NOTHING;

-- 2) o mesmo advertiser nunca é sincronizado duas vezes
CREATE UNIQUE INDEX uq_conn_active_platform_account ON crm.ad_platform_connections (platform, selected_ad_account_id)
  WHERE status = 'active' AND selected_ad_account_id IS NOT NULL;
ALTER TABLE crm.ad_platform_connections ADD COLUMN IF NOT EXISTS shared_company_ids uuid[] NOT NULL DEFAULT '{}';

-- 3) campanha TikTok → evento OU música
ALTER TABLE crm.tiktok_campaign
  ADD COLUMN IF NOT EXISTS linked_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_event_locked boolean NOT NULL DEFAULT false;
ALTER TABLE crm.tiktok_campaign ADD CONSTRAINT tiktok_campaign_event_xor_song
  CHECK (linked_event_id IS NULL OR linked_song_id IS NULL);
CREATE INDEX IF NOT EXISTS idx_tiktok_campaign_linked_event ON crm.tiktok_campaign(linked_event_id) WHERE linked_event_id IS NOT NULL;

CREATE POLICY tiktok_campaign_event_company_select ON crm.tiktok_campaign FOR SELECT TO authenticated
  USING (linked_event_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = tiktok_campaign.linked_event_id AND e.company_id = public.current_company_id()));
CREATE POLICY tiktok_insights_event_company_select ON crm.tiktok_insights_daily FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM crm.tiktok_campaign c JOIN public.events e ON e.id = c.linked_event_id
    WHERE c.connection_id = tiktok_insights_daily.connection_id
      AND c.external_campaign_id = tiktok_insights_daily.external_campaign_id
      AND e.company_id = public.current_company_id()));

CREATE VIEW crm.tiktok_campaign_carreira WITH (security_invoker = true) AS
  SELECT * FROM crm.tiktok_campaign WHERE linked_event_id IS NULL;
CREATE VIEW crm.tiktok_insights_daily_carreira WITH (security_invoker = true) AS
  SELECT i.* FROM crm.tiktok_insights_daily i
  WHERE NOT EXISTS (SELECT 1 FROM crm.tiktok_campaign c
                    WHERE c.connection_id = i.connection_id AND c.external_campaign_id = i.external_campaign_id
                      AND c.linked_event_id IS NOT NULL);
GRANT SELECT ON crm.tiktok_campaign_carreira, crm.tiktok_insights_daily_carreira TO authenticated, service_role;

DO $do$
DECLARE r record; v text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE (n.nspname, p.proname) IN (('public','artist_ads_campaigns'),('public','artist_ads_daily'),
             ('public','artist_ads_period_report'),('public','artist_ads_investment_report'),
             ('public','_artist_ads_investment_source'),('crm','artist_ads_tiktok_alerts_core'))
  LOOP
    v := pg_get_functiondef(r.oid);
    v := regexp_replace(v, 'crm\.tiktok_campaign(?![a-z_])', 'crm.tiktok_campaign_carreira', 'g');
    v := regexp_replace(v, 'crm\.tiktok_insights_daily(?![a-z_])', 'crm.tiktok_insights_daily_carreira', 'g');
    EXECUTE v;
  END LOOP;
END $do$;

CREATE OR REPLACE FUNCTION public.tiktok_event_distinct_tokens(p_name text)
RETURNS text[] LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  SELECT coalesce(array_agg(DISTINCT tok), '{}') FROM regexp_split_to_table(
    regexp_replace(lower(extensions.unaccent(coalesce(p_name,''))), '[^a-z0-9]+', ' ', 'g'), ' ') tok
  WHERE length(tok) >= 4 AND tok !~ '^[0-9]+$'
    AND tok NOT IN ('festival','tour','turne','vendas','trafego','show','live','edicao')
    AND NOT EXISTS (SELECT 1 FROM public.cities ci
                    WHERE tok = ANY(regexp_split_to_array(regexp_replace(lower(extensions.unaccent(ci.name)), '[^a-z0-9]+', ' ', 'g'), ' ')))
$$;

CREATE OR REPLACE FUNCTION public.tiktok_auto_link_events_for_connection(p_connection_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public, extensions AS $$
DECLARE v_shared uuid[]; v_linked int := 0; v_ambig jsonb := '[]'::jsonb; r record;
BEGIN
  SELECT shared_company_ids INTO v_shared FROM crm.ad_platform_connections WHERE id = p_connection_id AND platform = 'tiktok';
  IF v_shared IS NULL OR cardinality(v_shared) = 0 THEN RETURN jsonb_build_object('ligadas',0,'partilhada',false); END IF;
  FOR r IN
    WITH ev AS (
      SELECT e.id, public.tiktok_event_distinct_tokens(e.name) toks FROM public.events e
      WHERE e.company_id = ANY(v_shared) AND e.status = 'active'),
    cp AS (
      SELECT c.id, c.name, ' '||regexp_replace(lower(extensions.unaccent(c.name)), '[^a-z0-9]+', ' ', 'g')||' ' cn
      FROM crm.tiktok_campaign c
      WHERE c.connection_id = p_connection_id AND c.linked_song_id IS NULL AND c.linked_event_id IS NULL
        AND NOT c.linked_event_locked AND coalesce(c.status,'') <> 'REMOVED'),
    m AS (
      SELECT cp.id cid, cp.name, ev.id eid FROM cp JOIN ev ON cardinality(ev.toks) > 0
      WHERE NOT EXISTS (SELECT 1 FROM unnest(ev.toks) t WHERE position(' '||t||' ' IN cp.cn) = 0))
    SELECT cid, name, array_agg(eid) eids FROM m GROUP BY cid, name
  LOOP
    IF cardinality(r.eids) = 1 THEN
      UPDATE crm.tiktok_campaign SET linked_event_id = r.eids[1], link_kind = 'event', updated_at = now() WHERE id = r.cid;
      v_linked := v_linked + 1;
    ELSE
      v_ambig := v_ambig || jsonb_build_array(r.name);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ligadas', v_linked, 'ambiguas', v_ambig, 'partilhada', true);
END $$;
REVOKE ALL ON FUNCTION public.tiktok_auto_link_events_for_connection(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tiktok_auto_link_events_for_connection(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tiktok_linkable_campaigns()
RETURNS TABLE(id uuid, external_campaign_id text, name text, status text, currency text, linked_event_id uuid, linked_event_locked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT c.id, c.external_campaign_id, c.name, c.status, c.currency, c.linked_event_id, c.linked_event_locked
  FROM crm.tiktok_campaign c JOIN crm.ad_platform_connections k ON k.id = c.connection_id
  WHERE public.current_company_id() = ANY(k.shared_company_ids)
    AND c.linked_song_id IS NULL AND coalesce(c.status,'') <> 'REMOVED'
    AND (c.linked_event_id IS NULL OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = c.linked_event_id AND e.company_id = public.current_company_id()))
  ORDER BY c.name
$$;
REVOKE ALL ON FUNCTION public.tiktok_linkable_campaigns() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tiktok_linkable_campaigns() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tiktok_set_campaign_event(p_campaign_id uuid, p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE c record; v_co uuid := public.current_company_id();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sem sessão'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
     AND (ur.role = 'platform_admin' OR (ur.role IN ('admin','manager','marketing_manager') AND ur.company_id = v_co))) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  SELECT t.linked_song_id, t.linked_event_id, k.shared_company_ids INTO c
  FROM crm.tiktok_campaign t JOIN crm.ad_platform_connections k ON k.id = t.connection_id WHERE t.id = p_campaign_id;
  IF NOT FOUND OR NOT (v_co = ANY(c.shared_company_ids)) THEN RAISE EXCEPTION 'campanha fora das contas partilhadas com a empresa'; END IF;
  IF c.linked_song_id IS NOT NULL THEN RAISE EXCEPTION 'campanha ligada a uma música (Carreira): evento OU música, nunca os dois'; END IF;
  IF c.linked_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = c.linked_event_id AND e.company_id = v_co) THEN
    RAISE EXCEPTION 'campanha ligada a evento de outra empresa';
  END IF;
  IF p_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event_id AND e.company_id = v_co) THEN
    RAISE EXCEPTION 'evento fora da empresa';
  END IF;
  UPDATE crm.tiktok_campaign SET linked_event_id = p_event_id, linked_event_locked = (p_event_id IS NOT NULL),
    link_kind = CASE WHEN p_event_id IS NULL THEN NULL ELSE 'event' END, updated_at = now()
  WHERE id = p_campaign_id;
  RETURN jsonb_build_object('ok', true, 'campaign_id', p_campaign_id, 'event_id', p_event_id);
END $$;
REVOKE ALL ON FUNCTION public.tiktok_set_campaign_event(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tiktok_set_campaign_event(uuid, uuid) TO authenticated, service_role;

-- 4) faturas TikTok no pipeline de Faturas Ads
ALTER TABLE public.ads_invoice DROP CONSTRAINT IF EXISTS ads_invoice_platform_check;
ALTER TABLE public.ads_invoice ADD CONSTRAINT ads_invoice_platform_check CHECK (platform IN ('meta','google','tiktok'));
ALTER TABLE public.ads_invoice_line DROP CONSTRAINT IF EXISTS ads_invoice_line_match_source_check;
ALTER TABLE public.ads_invoice_line ADD CONSTRAINT ads_invoice_line_match_source_check
  CHECK (match_source IN ('erp_link','fuzzy','manual','none','regra','fora_sistema','carreira'));
ALTER TABLE public.ads_invoice_line ADD CONSTRAINT ads_invoice_line_carreira_sem_evento
  CHECK (match_source <> 'carreira' OR event_id IS NULL);

CREATE OR REPLACE FUNCTION public.ads_invoice_line_is_pending(l ads_invoice_line)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT NOT COALESCE(l.is_adjustment, false)
     AND COALESCE(l.match_source, '') NOT IN ('fora_sistema','carreira')
     AND (l.event_id IS NULL OR l.match_source = 'none')
$function$;