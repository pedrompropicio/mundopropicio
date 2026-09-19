-- D-ERP93
-- (b) trinco de ligação a música
ALTER TABLE crm.meta_campaign_snapshot
  ADD COLUMN IF NOT EXISTS linked_song_locked boolean NOT NULL DEFAULT false;
ALTER TABLE crm.google_campaign
  ADD COLUMN IF NOT EXISTS linked_song_locked boolean NOT NULL DEFAULT false;

-- (c) ligar manualmente fecha o trinco
CREATE OR REPLACE FUNCTION public.artist_ads_link_song(p_platform text, p_campaign_id text, p_song_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_company uuid; v_n int := 0;
BEGIN
  IF p_platform NOT IN ('google','meta') THEN
    RAISE EXCEPTION 'plataforma inválida' USING ERRCODE = '22023';
  END IF;
  SELECT company_id INTO v_company FROM public.artist_songs WHERE id = p_song_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'música inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_uid IS NOT NULL AND NOT (
      public.has_role(v_uid,'platform_admin'::app_role) OR public.has_role(v_uid,'admin'::app_role)
      OR public.has_role(v_uid,'manager'::app_role) OR public.has_role(v_uid,'marketing_manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'sem permissão para ligar campanha a música' USING ERRCODE = '42501';
  END IF;
  -- D-ERP93: decisão humana fecha o trinco; o auto-link deixa de tocar nesta linha.
  IF p_platform = 'google' THEN
    UPDATE crm.google_campaign SET linked_song_id = p_song_id, linked_song_locked = true
    WHERE external_campaign_id = p_campaign_id AND company_id = v_company;
  ELSE
    UPDATE crm.meta_campaign_snapshot SET linked_song_id = p_song_id, linked_song_locked = true
    WHERE external_campaign_id = p_campaign_id AND company_id = v_company;
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

-- (c) desligar
CREATE OR REPLACE FUNCTION public.artist_ads_unlink_song(p_platform text, p_campaign_id text, p_artist_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_company uuid; v_n int := 0;
BEGIN
  IF p_platform NOT IN ('google','meta') THEN
    RAISE EXCEPTION 'plataforma inválida' USING ERRCODE = '22023';
  END IF;
  v_company := public.artist_ads_assert_access(p_artist_id);
  IF v_uid IS NOT NULL AND NOT (
      public.has_role(v_uid,'platform_admin'::app_role) OR public.has_role(v_uid,'admin'::app_role)
      OR public.has_role(v_uid,'manager'::app_role) OR public.has_role(v_uid,'marketing_manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'sem permissão para desligar campanha de música' USING ERRCODE = '42501';
  END IF;
  IF p_platform = 'google' THEN
    UPDATE crm.google_campaign gc
      SET linked_song_id = NULL, linked_song_locked = true
    WHERE gc.external_campaign_id = p_campaign_id
      AND EXISTS (
        SELECT 1 FROM crm.ad_platform_connections c
        WHERE c.id = gc.connection_id AND c.connection_scope = 'artist'
          AND c.artist_id = p_artist_id AND c.company_id = v_company
      );
  ELSE
    UPDATE crm.meta_campaign_snapshot ms
      SET linked_song_id = NULL, linked_song_locked = true
    WHERE ms.external_campaign_id = p_campaign_id
      AND EXISTS (
        SELECT 1 FROM crm.ad_platform_connections c
        WHERE c.id = ms.connection_id AND c.connection_scope = 'artist'
          AND c.artist_id = p_artist_id AND c.company_id = v_company
      );
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

REVOKE ALL ON FUNCTION public.artist_ads_unlink_song(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.artist_ads_unlink_song(text, text, uuid) TO anon, authenticated, service_role;

-- (d) auto-link respeita o trinco
CREATE OR REPLACE FUNCTION crm.artist_ads_autolink_songs_core(p_artist_id uuid, p_company_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_total int := 0; v_n int;
BEGIN
  WITH songs AS (
    SELECT s.id, public.artist_ads_norm(public.artist_song_base_title(s.title)) AS bt, s.created_at
    FROM public.artist_songs s
    WHERE s.artist_id = p_artist_id AND s.company_id = p_company_id
  ), gmatch AS (
    SELECT DISTINCT ON (gc.id) gc.id AS campaign_row, s.id AS song_id
    FROM crm.google_campaign gc
    JOIN crm.ad_platform_connections c ON c.id = gc.connection_id
      AND c.connection_scope='artist' AND c.artist_id = p_artist_id
    JOIN songs s ON length(s.bt) >= 8 AND public.artist_ads_norm(gc.name) LIKE '%'||s.bt||'%'
    WHERE gc.linked_song_id IS NULL AND NOT gc.linked_song_locked
    ORDER BY gc.id, length(s.bt) DESC, s.created_at ASC
  )
  UPDATE crm.google_campaign gc SET linked_song_id = m.song_id
  FROM gmatch m WHERE gc.id = m.campaign_row;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  WITH songs AS (
    SELECT s.id, public.artist_ads_norm(public.artist_song_base_title(s.title)) AS bt, s.created_at
    FROM public.artist_songs s
    WHERE s.artist_id = p_artist_id AND s.company_id = p_company_id
  ), mmatch AS (
    SELECT DISTINCT ON (ms.id) ms.id AS campaign_row, s.id AS song_id
    FROM crm.meta_campaign_snapshot ms
    JOIN crm.ad_platform_connections c ON c.id = ms.connection_id
      AND c.connection_scope='artist' AND c.artist_id = p_artist_id
    JOIN songs s ON length(s.bt) >= 8 AND public.artist_ads_norm(ms.name) LIKE '%'||s.bt||'%'
    WHERE ms.linked_song_id IS NULL AND NOT ms.linked_song_locked
    ORDER BY ms.id, length(s.bt) DESC, s.created_at ASC
  )
  UPDATE crm.meta_campaign_snapshot ms SET linked_song_id = m.song_id
  FROM mmatch m WHERE ms.id = m.campaign_row;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  RETURN v_total;
END $function$;

-- (a) artist_ads_ads: união insights + snapshot
CREATE OR REPLACE FUNCTION public.artist_ads_ads(p_artist_id uuid, p_campaign_id text DEFAULT NULL::text)
 RETURNS TABLE(platform text, connection_id uuid, currency text, campaign_id text, campaign_name text, adset_id text, adset_name text, ad_id text, ad_name text, status text, creative_id text, thumbnail_url text, permalink text, spend_7d numeric, impressions_7d bigint, clicks_7d bigint, ctr_7d numeric, cpc_7d numeric, video_3s_views_7d bigint, thruplays_7d bigint, cost_per_thruplay_7d numeric, spend_30d numeric, impressions_30d bigint, clicks_30d bigint, ctr_30d numeric, cpc_30d numeric, video_3s_views_30d bigint, thruplays_30d bigint, cost_per_thruplay_30d numeric, linked_song_id uuid, last_synced_at timestamp with time zone, ref_currency text, spend_7d_ref numeric, spend_30d_ref numeric, fx_missing_days integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  WITH guard AS (SELECT public.artist_ads_assert_access(p_artist_id) AS company_id),
  ref AS (
    SELECT coalesce(a.reporting_currency, co.currency) AS ref_currency
    FROM public.artists a LEFT JOIN public.companies co ON co.id = a.company_id
    WHERE a.id = p_artist_id
  ),
  conns AS (
    SELECT c.* FROM crm.ad_platform_connections c, guard g
    WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id
      AND c.company_id = g.company_id AND c.platform = 'meta'
  ),
  -- D-ERP93: os insights são a fonte de verdade do GASTO. Um anúncio cuja ficha
  -- ainda não chegou ao snapshot (ex.: estado herdado CAMPAIGN_PAUSED, que o sync
  -- excluía) tem de aparecer, senão a soma por anúncio não bate com a campanha.
  ins AS (
    SELECT i.connection_id, i.external_ad_id,
      (array_agg(i.external_adset_id ORDER BY i.date_start DESC) FILTER (WHERE nullif(i.external_adset_id,'') IS NOT NULL))[1] AS external_adset_id,
      (array_agg(i.external_campaign_id ORDER BY i.date_start DESC) FILTER (WHERE nullif(i.external_campaign_id,'') IS NOT NULL))[1] AS external_campaign_id,
      (array_agg(i.ad_name ORDER BY i.date_start DESC) FILTER (WHERE i.ad_name IS NOT NULL))[1] AS ad_name,
      (array_agg(i.adset_name ORDER BY i.date_start DESC) FILTER (WHERE i.adset_name IS NOT NULL))[1] AS adset_name,
      (array_agg(i.campaign_name ORDER BY i.date_start DESC) FILTER (WHERE i.campaign_name IS NOT NULL))[1] AS campaign_name,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_7d,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN coalesce(i.impressions,0) ELSE 0 END) AS impressions_7d,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN coalesce(i.clicks,0) ELSE 0 END) AS clicks_7d,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN coalesce(i.video_3s_views,0) ELSE 0 END) AS v3s_7d,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN coalesce(i.video_thruplays,0) ELSE 0 END) AS thru_7d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.impressions,0) ELSE 0 END) AS impressions_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.clicks,0) ELSE 0 END) AS clicks_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.video_3s_views,0) ELSE 0 END) AS v3s_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.video_thruplays,0) ELSE 0 END) AS thru_30d,
      (array_agg(i.currency ORDER BY i.date_start DESC) FILTER (WHERE i.currency IS NOT NULL))[1] AS currency,
      -- D-ERP92: conversão AO DIA, linha a linha.
      sum(CASE WHEN i.date_start >= current_date - 6
               THEN public.fx_convert(i.spend_cents/100.0, coalesce(i.currency, c.selected_ad_account_currency),
                                      r.ref_currency, i.date_start) END) AS spend_7d_ref,
      sum(CASE WHEN i.date_start >= current_date - 29
               THEN public.fx_convert(i.spend_cents/100.0, coalesce(i.currency, c.selected_ad_account_currency),
                                      r.ref_currency, i.date_start) END) AS spend_30d_ref,
      count(DISTINCT i.date_start) FILTER (
        WHERE i.date_start >= current_date - 29 AND coalesce(i.spend_cents,0) > 0
          AND public.fx_convert(i.spend_cents/100.0, coalesce(i.currency, c.selected_ad_account_currency),
                                r.ref_currency, i.date_start) IS NULL
      )::integer AS fx_missing_days
    FROM crm.meta_ad_insights_daily i
    JOIN conns c ON c.id = i.connection_id
    CROSS JOIN ref r
    WHERE i.date_start >= current_date - 29
    GROUP BY 1,2
  ),
  keys AS (
    SELECT i.connection_id, i.external_ad_id FROM ins i
    UNION
    SELECT a.connection_id, a.external_ad_id
    FROM crm.meta_ad_snapshot a JOIN conns c ON c.id = a.connection_id
  ),
  base AS (
    SELECT
      'meta'::text AS platform,
      c.id AS connection_id,
      coalesce(i.currency, ms.currency, c.selected_ad_account_currency) AS currency,
      coalesce(a.external_campaign_id, i.external_campaign_id) AS campaign_id,
      coalesce(ms.name, a.raw->>'campaign_name', i.campaign_name) AS campaign_name,
      coalesce(nullif(a.external_adset_id,''), i.external_adset_id) AS adset_id,
      coalesce(asn.name, i.adset_name) AS adset_name,
      k.external_ad_id AS ad_id,
      coalesce(a.name, i.ad_name) AS ad_name,
      coalesce(a.effective_status, a.status) AS status,
      coalesce(a.meta_creative_id, a.raw->'creative'->>'id') AS creative_id,
      a.raw->'creative'->>'thumbnail_url' AS thumbnail_url,
      CASE
        WHEN nullif(a.raw->'creative'->>'instagram_permalink_url','') IS NOT NULL
          THEN a.raw->'creative'->>'instagram_permalink_url'
        WHEN nullif(a.raw->'creative'->>'effective_object_story_id','') IS NOT NULL
             AND split_part(a.raw->'creative'->>'effective_object_story_id','_',2) <> ''
          THEN 'https://www.facebook.com/'
               || split_part(a.raw->'creative'->>'effective_object_story_id','_',1)
               || '/posts/'
               || split_part(a.raw->'creative'->>'effective_object_story_id','_',2)
        ELSE NULL
      END AS permalink,
      coalesce(i.spend_7d,0) AS spend_7d,
      coalesce(i.impressions_7d,0)::bigint AS impressions_7d,
      coalesce(i.clicks_7d,0)::bigint AS clicks_7d,
      coalesce(i.v3s_7d,0)::bigint AS video_3s_views_7d,
      coalesce(i.thru_7d,0)::bigint AS thruplays_7d,
      coalesce(i.spend_30d,0) AS spend_30d,
      coalesce(i.impressions_30d,0)::bigint AS impressions_30d,
      coalesce(i.clicks_30d,0)::bigint AS clicks_30d,
      coalesce(i.v3s_30d,0)::bigint AS video_3s_views_30d,
      coalesce(i.thru_30d,0)::bigint AS thruplays_30d,
      ms.linked_song_id AS linked_song_id,
      a.last_synced_at AS last_synced_at,
      i.spend_7d_ref AS spend_7d_ref,
      i.spend_30d_ref AS spend_30d_ref,
      coalesce(i.fx_missing_days,0) AS fx_missing_days
    FROM keys k
    JOIN conns c ON c.id = k.connection_id
    LEFT JOIN ins i ON i.connection_id = k.connection_id AND i.external_ad_id = k.external_ad_id
    LEFT JOIN crm.meta_ad_snapshot a
      ON a.connection_id = k.connection_id AND a.external_ad_id = k.external_ad_id
    LEFT JOIN crm.meta_adset_snapshot asn
      ON asn.connection_id = c.id AND asn.external_adset_id = coalesce(nullif(a.external_adset_id,''), i.external_adset_id)
    LEFT JOIN crm.meta_campaign_snapshot ms
      ON ms.connection_id = c.id AND ms.external_campaign_id = coalesce(a.external_campaign_id, i.external_campaign_id)
    -- D-ERP93: eliminados/arquivados só se escondem se NÃO tiveram gasto na janela.
    WHERE (upper(coalesce(a.effective_status, a.status, '')) NOT IN ('DELETED','ARCHIVED')
           OR coalesce(i.spend_30d,0) > 0)
      AND (p_campaign_id IS NULL OR coalesce(a.external_campaign_id, i.external_campaign_id) = p_campaign_id)
  )
  SELECT b.platform, b.connection_id, b.currency,
    b.campaign_id, b.campaign_name, b.adset_id, b.adset_name,
    b.ad_id, b.ad_name, b.status,
    b.creative_id, b.thumbnail_url, b.permalink,
    b.spend_7d, b.impressions_7d, b.clicks_7d,
    CASE WHEN b.impressions_7d > 0 THEN round(b.clicks_7d::numeric / b.impressions_7d, 6) END,
    CASE WHEN b.clicks_7d > 0 THEN round(b.spend_7d / b.clicks_7d, 4) END,
    b.video_3s_views_7d, b.thruplays_7d,
    CASE WHEN b.thruplays_7d > 0 THEN round(b.spend_7d / b.thruplays_7d, 4) END,
    b.spend_30d, b.impressions_30d, b.clicks_30d,
    CASE WHEN b.impressions_30d > 0 THEN round(b.clicks_30d::numeric / b.impressions_30d, 6) END,
    CASE WHEN b.clicks_30d > 0 THEN round(b.spend_30d / b.clicks_30d, 4) END,
    b.video_3s_views_30d, b.thruplays_30d,
    CASE WHEN b.thruplays_30d > 0 THEN round(b.spend_30d / b.thruplays_30d, 4) END,
    b.linked_song_id, b.last_synced_at,
    (SELECT ref_currency FROM ref), b.spend_7d_ref, b.spend_30d_ref, b.fx_missing_days
  FROM base b
  ORDER BY b.spend_30d DESC, b.ad_name NULLS LAST
$function$;

-- (e) a campanha desligada à mão a 19/09 fica marcada como decisão humana
UPDATE crm.meta_campaign_snapshot
   SET linked_song_locked = true
 WHERE external_campaign_id = '120245670746070358'
   AND connection_id = 'e5d12c36-cd0f-412a-a1c0-22ddbb2a336e';