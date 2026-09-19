ALTER TABLE crm.meta_publish_plan
  ALTER COLUMN event_id DROP NOT NULL,
  ADD COLUMN artist_id uuid REFERENCES public.artists(id) ON DELETE RESTRICT,
  ADD COLUMN song_id uuid REFERENCES public.artist_songs(id) ON DELETE RESTRICT,
  ADD COLUMN connection_id uuid REFERENCES crm.ad_platform_connections(id) ON DELETE RESTRICT,
  ADD CONSTRAINT meta_publish_plan_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE crm.google_publish_plan
  ALTER COLUMN event_id DROP NOT NULL,
  ADD COLUMN artist_id uuid REFERENCES public.artists(id) ON DELETE RESTRICT,
  ADD COLUMN song_id uuid REFERENCES public.artist_songs(id) ON DELETE RESTRICT;

ALTER TABLE crm.meta_campaign_strategies
  ADD COLUMN artist_id uuid REFERENCES public.artists(id) ON DELETE RESTRICT,
  ADD COLUMN song_id uuid REFERENCES public.artist_songs(id) ON DELETE RESTRICT;

ALTER TABLE crm.meta_publish_plan ADD CONSTRAINT meta_publish_plan_one_target CHECK (
  (event_id IS NOT NULL AND artist_id IS NULL AND song_id IS NULL)
  OR (event_id IS NULL AND artist_id IS NOT NULL AND song_id IS NOT NULL AND connection_id IS NOT NULL));

ALTER TABLE crm.google_publish_plan ADD CONSTRAINT google_publish_plan_one_target CHECK (
  (event_id IS NOT NULL AND artist_id IS NULL AND song_id IS NULL)
  OR (event_id IS NULL AND artist_id IS NOT NULL AND song_id IS NOT NULL AND connection_id IS NOT NULL));

ALTER TABLE crm.meta_campaign_strategies ADD CONSTRAINT meta_campaign_strategies_at_most_one_target CHECK (
  (artist_id IS NULL AND song_id IS NULL)
  OR (event_id IS NULL AND artist_id IS NOT NULL AND song_id IS NOT NULL));

CREATE OR REPLACE FUNCTION crm.assert_song_target_coherent() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public','crm' AS $$
DECLARE v_song public.artist_songs%ROWTYPE; v_conn crm.ad_platform_connections%ROWTYPE;
BEGIN
  IF NEW.song_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_song FROM public.artist_songs WHERE id = NEW.song_id;
  IF v_song.artist_id IS DISTINCT FROM NEW.artist_id OR v_song.company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'música não pertence a este artista/empresa' USING ERRCODE = '23514';
  END IF;
  IF NEW.connection_id IS NOT NULL THEN
    SELECT * INTO v_conn FROM crm.ad_platform_connections WHERE id = NEW.connection_id;
    IF v_conn.connection_scope IS DISTINCT FROM 'artist' OR v_conn.artist_id IS DISTINCT FROM NEW.artist_id
       OR v_conn.company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'alvo música exige connection de artista do mesmo artista' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_song_target_coherent BEFORE INSERT OR UPDATE ON crm.meta_publish_plan
  FOR EACH ROW EXECUTE FUNCTION crm.assert_song_target_coherent();
CREATE TRIGGER trg_song_target_coherent BEFORE INSERT OR UPDATE ON crm.google_publish_plan
  FOR EACH ROW EXECUTE FUNCTION crm.assert_song_target_coherent();
CREATE TRIGGER trg_song_target_coherent BEFORE INSERT OR UPDATE ON crm.meta_campaign_strategies
  FOR EACH ROW EXECUTE FUNCTION crm.assert_song_target_coherent();

CREATE TABLE crm.artist_ads_budget_caps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL UNIQUE REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta','google','tiktok')),
  daily_cap numeric(14,2) NOT NULL CHECK (daily_cap > 0),
  currency text NOT NULL,
  notes text,
  set_by uuid,
  set_at timestamptz NOT NULL DEFAULT now());

REVOKE ALL ON crm.artist_ads_budget_caps FROM PUBLIC, anon, authenticated;
GRANT SELECT ON crm.artist_ads_budget_caps TO authenticated;
GRANT ALL ON crm.artist_ads_budget_caps TO service_role;
ALTER TABLE crm.artist_ads_budget_caps ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON crm.artist_ads_budget_caps
  FOR SELECT TO authenticated USING (company_id = current_company_id());
CREATE POLICY service_role_bypass ON crm.artist_ads_budget_caps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE crm.ads_entity_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('google','tiktok')),
  ad_account_id text NOT NULL,
  plan_id uuid, event_id uuid, artist_id uuid, song_id uuid,
  entity_type text NOT NULL, external_id text NOT NULL, entity_name text,
  action text NOT NULL, prev_status text, new_status text, updates_jsonb jsonb,
  success boolean NOT NULL, error_message text, platform_response_jsonb jsonb,
  performed_by uuid, approved_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now());

REVOKE ALL ON crm.ads_entity_actions_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON crm.ads_entity_actions_log TO authenticated;
GRANT ALL ON crm.ads_entity_actions_log TO service_role;
ALTER TABLE crm.ads_entity_actions_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON crm.ads_entity_actions_log
  FOR SELECT TO authenticated USING (company_id = current_company_id());
CREATE POLICY service_role_bypass ON crm.ads_entity_actions_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE VIEW crm.v_ads_entity_actions_log WITH (security_invoker = true) AS
  SELECT id, company_id, connection_id, 'meta'::text AS platform, ad_account_id, entity_type, external_id,
         entity_name, action, prev_status, new_status, updates_jsonb, success, error_message,
         meta_response_jsonb AS platform_response_jsonb, performed_by, NULL::uuid AS approved_by, performed_at
  FROM crm.meta_entity_actions_log
  UNION ALL
  SELECT id, company_id, connection_id, platform, ad_account_id, entity_type, external_id,
         entity_name, action, prev_status, new_status, updates_jsonb, success, error_message,
         platform_response_jsonb, performed_by, approved_by, performed_at
  FROM crm.ads_entity_actions_log;

REVOKE ALL ON crm.v_ads_entity_actions_log FROM PUBLIC, anon;
GRANT SELECT ON crm.v_ads_entity_actions_log TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.artist_song_playlist_streams_set(uuid, date, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_song_playlist_streams_set(uuid, date, integer, jsonb) TO authenticated, service_role;