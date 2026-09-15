ALTER TABLE crm.google_campaign
  ADD COLUMN IF NOT EXISTS linked_song_id uuid REFERENCES public.artist_songs(id) ON DELETE SET NULL;
ALTER TABLE crm.meta_campaign_snapshot
  ADD COLUMN IF NOT EXISTS linked_song_id uuid REFERENCES public.artist_songs(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.artist_ads_norm(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT btrim(regexp_replace(
    lower(translate(coalesce(p_text,''),
      'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn')),
    '[^a-z0-9]+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.artist_ads_assert_access(p_artist_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_uid uuid := auth.uid();
BEGIN
  SELECT company_id INTO v_company FROM public.artists WHERE id = p_artist_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'artista inexistente ou sem empresa' USING ERRCODE = '42501';
  END IF;
  IF v_uid IS NULL THEN
    RETURN v_company;
  END IF;
  IF public.has_role(v_uid, 'platform_admin'::app_role) THEN
    RETURN v_company;
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.company_id = v_company) THEN
    RETURN v_company;
  END IF;
  RAISE EXCEPTION 'sem acesso a este artista' USING ERRCODE = '42501';
END $$;

CREATE OR REPLACE FUNCTION public.artist_ads_campaigns(p_artist_id uuid, p_include_removed boolean DEFAULT false)
RETURNS TABLE (
  platform text, connection_id uuid, connection_status text,
  account_id text, account_name text, currency text,
  campaign_id text, campaign_name text, status text, objective text,
  budget_daily numeric, start_date date, end_date date,
  spend_7d numeric, spend_30d numeric, impressions_30d bigint, clicks_30d bigint,
  video_views_30d bigint, results_30d numeric, cpc_30d numeric, cpv_30d numeric,
  last_synced_at timestamptz, linked_song_id uuid, linked_event_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, crm AS $$
  WITH guard AS (SELECT public.artist_ads_assert_access(p_artist_id) AS company_id),
  conns AS (
    SELECT c.* FROM crm.ad_platform_connections c, guard g
    WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id AND c.company_id = g.company_id
  ),
  g_ins AS (
    SELECT i.connection_id, i.external_campaign_id,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_7d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.impressions ELSE 0 END) AS impressions_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.clicks ELSE 0 END) AS clicks_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 AND i.raw->>'video_views' ~ '^[0-9]+$'
               THEN (i.raw->>'video_views')::bigint ELSE 0 END) AS video_views_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.conversions ELSE 0 END) AS results_30d
    FROM crm.google_campaign_insights_daily i
    WHERE i.connection_id IN (SELECT id FROM conns WHERE platform = 'google')
    GROUP BY 1,2
  ),
  m_ins AS (
    SELECT i.connection_id, i.external_campaign_id,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_7d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.impressions ELSE 0 END) AS impressions_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.clicks ELSE 0 END) AS clicks_30d,
      sum(CASE WHEN i.date_start >= current_date - 29
               THEN coalesce(i.video_thruplays, i.video_3s_views, i.video_plays, 0) ELSE 0 END) AS video_views_30d,
      sum(CASE WHEN i.date_start >= current_date - 29
               THEN coalesce(i.purchases_count,0) + coalesce(i.leads_count,0) ELSE 0 END)::numeric AS results_30d
    FROM crm.meta_campaign_insights_daily i
    WHERE i.connection_id IN (SELECT id FROM conns WHERE platform = 'meta')
    GROUP BY 1,2
  ),
  allrows AS (
    SELECT 'google'::text AS platform, c.id AS connection_id, c.status AS connection_status,
      c.selected_ad_account_id AS account_id, c.selected_ad_account_name AS account_name,
      c.selected_ad_account_currency AS currency,
      gc.external_campaign_id AS campaign_id, gc.name AS campaign_name, gc.status AS status,
      gc.advertising_channel_type AS objective,
      gc.budget_amount_micros / 1000000.0 AS budget_daily,
      gc.start_date AS start_date, gc.end_date AS end_date,
      coalesce(i.spend_7d,0) AS spend_7d, coalesce(i.spend_30d,0) AS spend_30d,
      coalesce(i.impressions_30d,0)::bigint AS impressions_30d, coalesce(i.clicks_30d,0)::bigint AS clicks_30d,
      coalesce(i.video_views_30d,0)::bigint AS video_views_30d, coalesce(i.results_30d,0) AS results_30d,
      gc.last_synced_at AS last_synced_at, gc.linked_song_id AS linked_song_id, gc.linked_event_id AS linked_event_id
    FROM conns c
    JOIN crm.google_campaign gc ON gc.connection_id = c.id
    LEFT JOIN g_ins i ON i.connection_id = gc.connection_id AND i.external_campaign_id = gc.external_campaign_id
    WHERE c.platform = 'google'
      AND (p_include_removed OR upper(coalesce(gc.status,'')) NOT IN ('REMOVED','DELETED'))
    UNION ALL
    SELECT 'meta'::text, c.id, c.status,
      c.selected_ad_account_id, c.selected_ad_account_name,
      coalesce(ms.currency, c.selected_ad_account_currency),
      ms.external_campaign_id, ms.name, coalesce(ms.effective_status, ms.status),
      ms.objective,
      coalesce(ms.daily_budget_cents,0) / 100.0,
      (ms.start_time)::date, (ms.stop_time)::date,
      coalesce(i.spend_7d,0), coalesce(i.spend_30d,0),
      coalesce(i.impressions_30d,0)::bigint, coalesce(i.clicks_30d,0)::bigint,
      coalesce(i.video_views_30d,0)::bigint, coalesce(i.results_30d,0),
      ms.last_synced_at, ms.linked_song_id, ms.linked_event_id
    FROM conns c
    JOIN crm.meta_campaign_snapshot ms ON ms.connection_id = c.id
    LEFT JOIN m_ins i ON i.connection_id = ms.connection_id AND i.external_campaign_id = ms.external_campaign_id
    WHERE c.platform = 'meta'
      AND (p_include_removed OR upper(coalesce(ms.effective_status, ms.status,'')) NOT IN ('DELETED','REMOVED','ARCHIVED'))
  )
  SELECT r.platform, r.connection_id, r.connection_status, r.account_id, r.account_name, r.currency,
    r.campaign_id, r.campaign_name, r.status, r.objective, r.budget_daily, r.start_date, r.end_date,
    r.spend_7d, r.spend_30d, r.impressions_30d, r.clicks_30d, r.video_views_30d, r.results_30d,
    CASE WHEN r.clicks_30d > 0 THEN round(r.spend_30d / r.clicks_30d, 4) END,
    CASE WHEN r.video_views_30d > 0 THEN round(r.spend_30d / r.video_views_30d, 4) END,
    r.last_synced_at, r.linked_song_id, r.linked_event_id
  FROM allrows r
  ORDER BY r.spend_30d DESC, r.start_date DESC NULLS LAST
$$;

CREATE OR REPLACE FUNCTION public.artist_ads_daily(p_artist_id uuid, p_days int DEFAULT 90)
RETURNS TABLE (
  platform text, campaign_id text, campaign_name text, day date,
  spend numeric, impressions bigint, clicks bigint, video_views bigint, results numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, crm AS $$
  WITH guard AS (SELECT public.artist_ads_assert_access(p_artist_id) AS company_id),
  conns AS (
    SELECT c.id, c.platform FROM crm.ad_platform_connections c, guard g
    WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id AND c.company_id = g.company_id
  ),
  s AS (
    SELECT 'google'::text AS platform, i.external_campaign_id AS campaign_id, i.campaign_name AS campaign_name,
      i.date_start AS day, i.spend_cents/100.0 AS spend,
      coalesce(i.impressions,0)::bigint AS impressions, coalesce(i.clicks,0)::bigint AS clicks,
      CASE WHEN i.raw->>'video_views' ~ '^[0-9]+$' THEN (i.raw->>'video_views')::bigint ELSE 0 END AS video_views,
      coalesce(i.conversions,0) AS results
    FROM crm.google_campaign_insights_daily i
    WHERE i.connection_id IN (SELECT id FROM conns WHERE platform='google')
      AND i.date_start >= current_date - (greatest(coalesce(p_days,90),1) - 1)
    UNION ALL
    SELECT 'meta'::text, i.external_campaign_id, i.campaign_name, i.date_start, i.spend_cents/100.0,
      coalesce(i.impressions,0)::bigint, coalesce(i.clicks,0)::bigint,
      coalesce(i.video_thruplays, i.video_3s_views, i.video_plays, 0)::bigint,
      (coalesce(i.purchases_count,0) + coalesce(i.leads_count,0))::numeric
    FROM crm.meta_campaign_insights_daily i
    WHERE i.connection_id IN (SELECT id FROM conns WHERE platform='meta')
      AND i.date_start >= current_date - (greatest(coalesce(p_days,90),1) - 1)
  )
  SELECT s.platform, s.campaign_id, s.campaign_name, s.day, s.spend, s.impressions, s.clicks, s.video_views, s.results
  FROM s ORDER BY s.day, s.platform, s.campaign_id
$$;

CREATE OR REPLACE FUNCTION public.artist_ads_link_song(p_platform text, p_campaign_id text, p_song_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, crm AS $$
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
  IF p_platform = 'google' THEN
    UPDATE crm.google_campaign SET linked_song_id = p_song_id
    WHERE external_campaign_id = p_campaign_id AND company_id = v_company;
  ELSE
    UPDATE crm.meta_campaign_snapshot SET linked_song_id = p_song_id
    WHERE external_campaign_id = p_campaign_id AND company_id = v_company;
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION public.artist_ads_autolink_songs(p_artist_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, crm AS $$
DECLARE v_company uuid; v_total int := 0; v_n int;
BEGIN
  v_company := public.artist_ads_assert_access(p_artist_id);

  WITH songs AS (
    SELECT s.id, public.artist_ads_norm(public.artist_song_base_title(s.title)) AS bt, s.created_at
    FROM public.artist_songs s
    WHERE s.artist_id = p_artist_id AND s.company_id = v_company
  ), gmatch AS (
    SELECT DISTINCT ON (gc.id) gc.id AS campaign_row, s.id AS song_id
    FROM crm.google_campaign gc
    JOIN crm.ad_platform_connections c ON c.id = gc.connection_id
      AND c.connection_scope='artist' AND c.artist_id = p_artist_id
    JOIN songs s ON length(s.bt) >= 8 AND public.artist_ads_norm(gc.name) LIKE '%'||s.bt||'%'
    WHERE gc.linked_song_id IS NULL
    ORDER BY gc.id, length(s.bt) DESC, s.created_at ASC
  )
  UPDATE crm.google_campaign gc SET linked_song_id = m.song_id
  FROM gmatch m WHERE gc.id = m.campaign_row;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  WITH songs AS (
    SELECT s.id, public.artist_ads_norm(public.artist_song_base_title(s.title)) AS bt, s.created_at
    FROM public.artist_songs s
    WHERE s.artist_id = p_artist_id AND s.company_id = v_company
  ), mmatch AS (
    SELECT DISTINCT ON (ms.id) ms.id AS campaign_row, s.id AS song_id
    FROM crm.meta_campaign_snapshot ms
    JOIN crm.ad_platform_connections c ON c.id = ms.connection_id
      AND c.connection_scope='artist' AND c.artist_id = p_artist_id
    JOIN songs s ON length(s.bt) >= 8 AND public.artist_ads_norm(ms.name) LIKE '%'||s.bt||'%'
    WHERE ms.linked_song_id IS NULL
    ORDER BY ms.id, length(s.bt) DESC, s.created_at ASC
  )
  UPDATE crm.meta_campaign_snapshot ms SET linked_song_id = m.song_id
  FROM mmatch m WHERE ms.id = m.campaign_row;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  RETURN v_total;
END $$;

CREATE OR REPLACE FUNCTION public.artist_ads_alerts(p_artist_id uuid)
RETURNS TABLE (platform text, kind text, severity text, message text, campaign_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, crm AS $$
  WITH guard AS (SELECT public.artist_ads_assert_access(p_artist_id) AS company_id),
  conns AS (
    SELECT c.* FROM crm.ad_platform_connections c, guard g
    WHERE c.connection_scope='artist' AND c.artist_id = p_artist_id AND c.company_id = g.company_id
  ),
  camp AS (SELECT * FROM public.artist_ads_campaigns(p_artist_id, false)),
  ins7 AS (
    SELECT 'google'::text AS platform, i.external_campaign_id AS campaign_id,
           sum(i.impressions) AS impressions_7d
    FROM crm.google_campaign_insights_daily i
    WHERE i.connection_id IN (SELECT id FROM conns WHERE platform='google')
      AND i.date_start >= current_date - 6
    GROUP BY 1,2
    UNION ALL
    SELECT 'meta', i.external_campaign_id, sum(i.impressions)
    FROM crm.meta_campaign_insights_daily i
    WHERE i.connection_id IN (SELECT id FROM conns WHERE platform='meta')
      AND i.date_start >= current_date - 6
    GROUP BY 1,2
  )
  SELECT c.platform, 'conta_sem_entrega'::text, 'alta'::text,
    'Campanha activa sem entrega nos últimos 7 dias: '||coalesce(c.campaign_name,c.campaign_id),
    c.campaign_id
  FROM camp c
  LEFT JOIN ins7 i ON i.platform = c.platform AND i.campaign_id = c.campaign_id
  WHERE upper(coalesce(c.status,'')) IN ('ENABLED','ACTIVE')
    AND coalesce(i.impressions_7d,0) = 0
    AND c.start_date IS NOT NULL AND c.start_date <= current_date - 2
  UNION ALL
  SELECT c.platform, 'token_a_expirar', 'alta',
    'A autorização da conta de anúncios expira a '||to_char(c.expires_at,'DD/MM/YYYY')||'.', NULL
  FROM conns c WHERE c.expires_at IS NOT NULL AND c.expires_at < now() + interval '7 days'
  UNION ALL
  SELECT c.platform, 'ligacao_com_erro', 'alta',
    'Ligação com problema ('||coalesce(c.status,'?')||')'||coalesce(': '||c.last_error,'')||'.', NULL
  FROM conns c
  WHERE coalesce(c.status,'') IN ('error','expired','revoked') OR c.last_error IS NOT NULL
  UNION ALL
  SELECT 'meta', 'pagamento_pendente', 'alta',
    'A conta de anúncios '||coalesce(a->>'name', c.selected_ad_account_id)||
    ' está com pagamento pendente ou desactivada (estado '||(a->>'account_status')||').', NULL
  FROM conns c
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(c.available_ad_accounts,'[]'::jsonb)) a
  WHERE c.platform='meta' AND a->>'id' = c.selected_ad_account_id
    AND (a->>'account_status') IN ('2','3')
$$;

REVOKE ALL ON FUNCTION public.artist_ads_campaigns(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_ads_daily(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_ads_alerts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_ads_link_song(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_ads_autolink_songs(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_ads_assert_access(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.artist_ads_campaigns(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_daily(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_alerts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_link_song(text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_autolink_songs(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_assert_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_norm(text) TO authenticated, service_role;