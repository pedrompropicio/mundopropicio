-- D-ERP141 — Smart links por música com pixel
CREATE TABLE public.song_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES public.artist_songs(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  default_mode text NOT NULL CHECK (default_mode IN ('redirect','choose','create_sound','presave')),
  title text,
  cover_url text,
  destinations jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(destinations) = 'object'),
  meta_pixel_id text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX song_links_song_idx ON public.song_links (song_id);
CREATE INDEX song_links_artist_idx ON public.song_links (artist_id);

REVOKE ALL ON public.song_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.song_links TO authenticated;
GRANT ALL ON public.song_links TO service_role;

ALTER TABLE public.song_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY song_links_select_company ON public.song_links
  FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid() AND ur.company_id = song_links.company_id)
  );

CREATE TRIGGER trg_song_links_updated_at
  BEFORE UPDATE ON public.song_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.song_link_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.song_links(id) ON DELETE CASCADE,
  company_id uuid,
  artist_id uuid,
  song_id uuid,
  event text NOT NULL CHECK (event IN ('arrival','choice')),
  mode text,
  destination text,
  opened text CHECK (opened IN ('app','web')),
  event_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  ttclid text,
  country text,
  region text,
  city text,
  device text,
  os text,
  in_app_browser text,
  ip_hash text,
  capi_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX song_link_events_link_created_idx ON public.song_link_events (link_id, created_at);
CREATE INDEX song_link_events_artist_created_idx ON public.song_link_events (artist_id, created_at);

REVOKE ALL ON public.song_link_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.song_link_events TO service_role;
ALTER TABLE public.song_link_events ENABLE ROW LEVEL SECURITY;

-- RPC pública (EXCEPÇÃO documentada à D-ERP94)
CREATE OR REPLACE FUNCTION public.song_link_public_get(p_slug text)
RETURNS TABLE(slug text, default_mode text, title text, cover_url text,
              destinations jsonb, meta_pixel_id text, active boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT l.slug, l.default_mode, l.title, l.cover_url, l.destinations, l.meta_pixel_id, l.active
  FROM public.song_links l
  WHERE l.slug = lower(btrim(coalesce(p_slug,''))) AND l.active
$$;
REVOKE ALL ON FUNCTION public.song_link_public_get(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.song_link_public_get(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.artist_song_link_upsert(
  p_song_id uuid, p_slug text, p_default_mode text,
  p_title text DEFAULT NULL, p_cover_url text DEFAULT NULL,
  p_destinations jsonb DEFAULT '{}'::jsonb, p_meta_pixel_id text DEFAULT NULL,
  p_active boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_artist uuid; v_company uuid; v_slug text; v_ex public.song_links; v_id uuid;
BEGIN
  SELECT artist_id INTO v_artist FROM public.artist_songs WHERE id = p_song_id;
  IF v_artist IS NULL THEN
    RAISE EXCEPTION 'música inexistente' USING ERRCODE = '22023';
  END IF;
  v_company := public.artist_ads_assert_access(v_artist);
  PERFORM public.artist_ads_assert_write(v_company);

  v_slug := lower(btrim(coalesce(p_slug,'')));
  IF p_destinations IS NULL OR jsonb_typeof(p_destinations) <> 'object' THEN
    RAISE EXCEPTION 'destinations tem de ser um objecto' USING ERRCODE = '22023';
  END IF;
  IF p_meta_pixel_id IS NOT NULL AND btrim(p_meta_pixel_id) <> '' AND btrim(p_meta_pixel_id) !~ '^[0-9]{5,20}$' THEN
    RAISE EXCEPTION 'meta_pixel_id inválido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_ex FROM public.song_links WHERE slug = v_slug;
  IF v_ex.id IS NOT NULL THEN
    IF v_ex.song_id <> p_song_id THEN
      RAISE EXCEPTION 'slug já usado por outra música' USING ERRCODE = '23505';
    END IF;
    UPDATE public.song_links SET
      default_mode = p_default_mode, title = p_title, cover_url = p_cover_url,
      destinations = p_destinations, meta_pixel_id = nullif(btrim(p_meta_pixel_id),''),
      active = coalesce(p_active, true)
    WHERE id = v_ex.id RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.song_links (company_id, artist_id, song_id, slug, default_mode, title,
      cover_url, destinations, meta_pixel_id, active, created_by)
    VALUES (v_company, v_artist, p_song_id, v_slug, p_default_mode, p_title, p_cover_url,
      p_destinations, nullif(btrim(p_meta_pixel_id),''), coalesce(p_active, true), auth.uid())
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.artist_song_link_upsert(uuid,text,text,text,text,jsonb,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_song_link_upsert(uuid,text,text,text,text,jsonb,text,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.artist_song_link_list(p_artist_id uuid)
RETURNS SETOF public.song_links
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_ads_assert_access(p_artist_id);
  PERFORM public.artist_ads_assert_write(v_company);
  RETURN QUERY
    SELECT * FROM public.song_links
    WHERE artist_id = p_artist_id AND company_id = v_company
    ORDER BY created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.artist_song_link_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_song_link_list(uuid) TO authenticated, service_role;

-- Igual a utmSlug() de _shared/campaign-target.ts
CREATE OR REPLACE FUNCTION public.song_link_utm_slug(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT left(regexp_replace(regexp_replace(lower(
           regexp_replace(normalize(coalesce(p,''), NFD), '[\u0300-\u036f]', '', 'g')),
           '[^a-z0-9]+', '-', 'g'), '^-+|-+$', '', 'g'), 80)
$$;
REVOKE ALL ON FUNCTION public.song_link_utm_slug(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.song_link_utm_slug(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.artist_song_link_stats(p_artist_id uuid, p_from date, p_to date)
RETURNS TABLE(dia date, link_id uuid, slug text, song_id uuid, utm_campaign text, utm_content text,
              chegadas bigint, escolhas bigint, escolhas_por_destino jsonb,
              aberturas_app bigint, aberturas_web bigint,
              campanha_id text, campanha_nome text, gasto_campanha_dia numeric, moeda text,
              custo_por_chegada numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'crm'
AS $$
  WITH guard AS (SELECT public.artist_ads_assert_access(p_artist_id) AS company_id),
  ev AS (
    SELECT e.link_id, e.event, e.opened, coalesce(e.destination,'(sem)') AS destination,
      coalesce(e.utm_campaign,'') AS utm_campaign, coalesce(e.utm_content,'') AS utm_content,
      (e.created_at AT TIME ZONE 'Europe/Lisbon')::date AS dia
    FROM public.song_link_events e, guard g
    WHERE e.artist_id = p_artist_id AND e.company_id = g.company_id
      AND e.created_at >= (p_from::timestamp AT TIME ZONE 'Europe/Lisbon')
      AND e.created_at <  ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Lisbon')
  ),
  base AS (
    SELECT dia, link_id, utm_campaign, utm_content,
      count(*) FILTER (WHERE event = 'arrival') AS chegadas,
      count(*) FILTER (WHERE event = 'choice')  AS escolhas,
      count(*) FILTER (WHERE opened = 'app')    AS aberturas_app,
      count(*) FILTER (WHERE opened = 'web')    AS aberturas_web
    FROM ev GROUP BY 1,2,3,4
  ),
  dest AS (
    SELECT dia, link_id, utm_campaign, utm_content, jsonb_object_agg(destination, n) AS d
    FROM (SELECT dia, link_id, utm_campaign, utm_content, destination, count(*) AS n
          FROM ev WHERE event = 'choice' GROUP BY 1,2,3,4,5) x
    GROUP BY 1,2,3,4
  ),
  camp AS (
    SELECT DISTINCT ON (public.song_link_utm_slug(ms.name))
      public.song_link_utm_slug(ms.name) AS cslug, ms.connection_id, ms.external_campaign_id,
      ms.name, coalesce(ms.currency, c.selected_ad_account_currency) AS currency
    FROM crm.meta_campaign_snapshot ms
    JOIN crm.ad_platform_connections c ON c.id = ms.connection_id
    CROSS JOIN guard g
    WHERE c.platform = 'meta' AND c.connection_scope = 'artist'
      AND c.artist_id = p_artist_id AND c.company_id = g.company_id
    ORDER BY public.song_link_utm_slug(ms.name), ms.last_synced_at DESC NULLS LAST
  ),
  spend AS (
    SELECT i.connection_id, i.external_campaign_id, i.date_start,
      sum(i.spend_cents)/100.0 AS gasto, max(i.currency) AS currency
    FROM crm.meta_campaign_insights_daily i
    JOIN camp cm ON cm.connection_id = i.connection_id AND cm.external_campaign_id = i.external_campaign_id
    WHERE i.date_start BETWEEN p_from AND p_to
    GROUP BY 1,2,3
  ),
  tot AS (SELECT dia, utm_campaign, sum(chegadas) AS n FROM base GROUP BY 1,2)
  SELECT b.dia, b.link_id, l.slug, l.song_id, nullif(b.utm_campaign,''), nullif(b.utm_content,''),
    b.chegadas, b.escolhas, coalesce(d.d, '{}'::jsonb), b.aberturas_app, b.aberturas_web,
    cm.external_campaign_id, cm.name, s.gasto, coalesce(s.currency, cm.currency),
    CASE WHEN s.gasto IS NOT NULL AND t.n > 0 THEN round(s.gasto / t.n, 4) END
  FROM base b
  JOIN public.song_links l ON l.id = b.link_id
  LEFT JOIN dest d ON d.dia = b.dia AND d.link_id = b.link_id
                  AND d.utm_campaign = b.utm_campaign AND d.utm_content = b.utm_content
  LEFT JOIN camp cm ON b.utm_campaign <> '' AND cm.cslug = b.utm_campaign
  LEFT JOIN spend s ON s.connection_id = cm.connection_id
                   AND s.external_campaign_id = cm.external_campaign_id AND s.date_start = b.dia
  LEFT JOIN tot t ON t.dia = b.dia AND t.utm_campaign = b.utm_campaign
  ORDER BY b.dia DESC, b.chegadas DESC
$$;
REVOKE ALL ON FUNCTION public.artist_song_link_stats(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_song_link_stats(uuid,date,date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.artist_ads_plan_create(p_artist_id uuid, p_song_id uuid, p_connection_id uuid, p_plan jsonb, p_platform text DEFAULT 'meta'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_company uuid; v_conn crm.ad_platform_connections; v_smart text; v_ok jsonb; v_id uuid;
BEGIN
  IF p_platform NOT IN ('meta','tiktok','google') THEN
    RAISE EXCEPTION 'plataforma não suportada' USING ERRCODE = '22023';
  END IF;

  v_company := public.artist_ads_assert_access(p_artist_id);
  PERFORM public.artist_ads_assert_write(v_company);

  SELECT * INTO v_conn FROM crm.ad_platform_connections
  WHERE id = p_connection_id AND connection_scope = 'artist'
    AND artist_id = p_artist_id AND company_id = v_company;
  IF v_conn.id IS NULL THEN
    RAISE EXCEPTION 'ligação de anúncios do artista inexistente ou fora do âmbito' USING ERRCODE = '42501';
  END IF;
  IF v_conn.platform IS DISTINCT FROM p_platform THEN
    RAISE EXCEPTION 'a ligação não é da plataforma indicada' USING ERRCODE = '22023';
  END IF;
  IF v_conn.selected_ad_account_currency IS NULL THEN
    RAISE EXCEPTION 'a ligação não tem moeda da conta de anúncios definida' USING ERRCODE = '22023';
  END IF;

  -- D-ERP141: smart link MP activo da música, senão artist_songs.smart_link_url.
  SELECT 'https://www.mundopropicio.com/m/' || l.slug INTO v_smart
  FROM public.song_links l
  WHERE l.song_id = p_song_id AND l.active AND l.company_id = v_company
  ORDER BY l.updated_at DESC LIMIT 1;
  IF v_smart IS NULL THEN
    SELECT smart_link_url INTO v_smart FROM public.artist_songs WHERE id = p_song_id;
  END IF;
  v_ok := public.artist_ads_plan_validate(p_plan, v_smart);

  INSERT INTO crm.meta_publish_plan (
    company_id, event_id, design_id, artist_id, song_id, connection_id, platform,
    objetivo, orcamento_total_cents, moeda, link_destino,
    adsets, resumo, estado, created_by, start_time, end_time)
  VALUES (
    v_company, NULL, NULL, p_artist_id, p_song_id, p_connection_id, p_platform,
    v_ok->>'objetivo',
    nullif(p_plan->>'orcamento_total_cents','')::bigint,
    v_conn.selected_ad_account_currency,
    v_ok->>'link_destino',
    v_ok->'adsets',
    p_plan->'resumo',
    'rascunho', auth.uid(),
    nullif(p_plan->>'start_time','')::timestamptz,
    nullif(p_plan->>'end_time','')::timestamptz)
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;
REVOKE EXECUTE ON FUNCTION public.artist_ads_plan_create(uuid,uuid,uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_plan_create(uuid,uuid,uuid,jsonb,text) TO authenticated, service_role;

INSERT INTO public.song_links (company_id, artist_id, song_id, slug, default_mode, title, destinations, meta_pixel_id, active)
VALUES ('cb5b15cb-ddaa-4cf9-bd88-4c09526e6fca', 'b1a53be0-e8a8-45c0-bc32-5eea23f477ed',
        '74c40d7b-357b-4311-acbe-eb9bfa7ba7c7', 'roupa-de-solteira', 'redirect',
        'Roupa De Solteira - Ao Vivo',
        jsonb_build_object(
          'spotify', jsonb_build_object('app','spotify:track:4qaxoOFrYCRpBnXWcneTFy',
                                        'web','https://open.spotify.com/track/4qaxoOFrYCRpBnXWcneTFy'),
          'tiktok_sound', jsonb_build_object('web','https://www.tiktok.com/music/-7681780720700327953')),
        NULL, true)
ON CONFLICT (slug) DO NOTHING;