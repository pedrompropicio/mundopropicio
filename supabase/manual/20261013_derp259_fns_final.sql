-- D-ERP259: definições finais (referência, gerado da base em 13/10/2026; NÃO executar — já aplicado pelas migrações 0123–0126).
CREATE OR REPLACE FUNCTION public._artist_ads_investment_source(p_artist_id uuid, p_from date, p_to date, p_country text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm', 'pg_catalog'
AS $function$ DECLARE v_company uuid; v_ref text; v_out jsonb; BEGIN v_company:=public.artist_access_check(p_artist_id,'read',NULL); SELECT coalesce(a.reporting_currency,c.currency,'EUR') INTO v_ref FROM public.artists a LEFT JOIN public.companies c ON c.id=a.company_id WHERE a.id=p_artist_id; WITH conns AS (
    SELECT c.id, c.platform, c.selected_ad_account_id, c.selected_ad_account_name, c.selected_ad_account_currency
    FROM crm.ad_platform_connections c
    WHERE c.connection_scope='artist' AND c.artist_id=p_artist_id AND c.company_id=v_company
  ),
  cmc AS (
    SELECT 'meta'::text platform, s.connection_id, s.external_campaign_id cid, coalesce(s.market_country,'?') mc
      FROM crm.meta_campaign_snapshot s JOIN conns c ON c.id=s.connection_id
    UNION ALL SELECT 'google', g.connection_id, g.external_campaign_id, coalesce(g.market_country,'?')
      FROM crm.google_campaign g JOIN conns c ON c.id=g.connection_id
    UNION ALL SELECT 'tiktok', t.connection_id, t.external_campaign_id, coalesce(t.market_country,'?')
      FROM crm.tiktok_campaign_carreira t JOIN conns c ON c.id=t.connection_id
  ),
  conn_sync AS (
    SELECT c.id, greatest(
      CASE WHEN c.platform='meta' THEN (SELECT max(i.last_synced_at) FROM crm.meta_campaign_insights_daily i WHERE i.connection_id=c.id) END,
      CASE WHEN c.platform='meta' THEN (SELECT max(s.last_sync_at) FROM crm.meta_sync_state s
            WHERE s.connection_id=c.id AND s.level='insights_campaign'
              AND (s.last_error_at IS NULL OR s.last_error_at < s.last_sync_at)) END,
      CASE WHEN c.platform='google' THEN (SELECT max(i.last_synced_at) FROM crm.google_campaign_insights_daily i WHERE i.connection_id=c.id) END,
      CASE WHEN c.platform='tiktok' THEN (SELECT max(i.recorded_at) FROM crm.tiktok_insights_daily_carreira i WHERE i.connection_id=c.id AND i.source<>'manual') END
    ) ok_ate
    FROM conns c
  ),
  t_lv AS (
    SELECT i.*, bool_or(i.level='campaign') OVER (PARTITION BY i.connection_id, i.external_campaign_id, i.date_start) has_c
    FROM crm.tiktok_insights_daily_carreira i JOIN conns c ON c.id=i.connection_id AND c.platform='tiktok'
    WHERE i.level IN ('campaign','adgroup') AND i.date_start BETWEEN p_from AND p_to
  ),
  cd AS (
    SELECT 'meta'::text platform, i.connection_id, i.external_campaign_id cid, i.date_start dia,
      coalesce(i.currency,c.selected_ad_account_currency) currency, i.spend_cents/100.0 spend,
      i.impressions::numeric imp, i.clicks::numeric clk,
      i.video_3s_views::numeric m3s, i.video_thruplays::numeric mthru, i.video_p25_watched::numeric p25,
      i.video_p50_watched::numeric p50, i.video_p75_watched::numeric p75, i.video_p100_watched::numeric p100,
      NULL::numeric gviews, NULL::numeric t2s, NULL::numeric t6s, NULL::numeric likes, NULL::numeric follows,
      i.last_synced_at leitura, 'api'::text src,
      NULL::numeric sm6,
      CASE WHEN i.clicks IS NOT NULL THEN i.spend_cents/100.0 END smc,
      CASE WHEN i.impressions IS NOT NULL THEN i.spend_cents/100.0 END smi,
      lk.lc,
      CASE WHEN lk.lc IS NOT NULL THEN i.spend_cents/100.0 END sml
    FROM crm.meta_campaign_insights_daily i
    LEFT JOIN LATERAL (SELECT sum((a->>'value')::numeric) lc FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(coalesce(i.actions, i.raw->'actions'))='array' THEN coalesce(i.actions, i.raw->'actions') ELSE '[]'::jsonb END) a
        WHERE a->>'action_type'='link_click') lk ON true JOIN conns c ON c.id=i.connection_id AND c.platform='meta'
    WHERE i.date_start BETWEEN p_from AND p_to
    UNION ALL
    SELECT 'google', i.connection_id, i.external_campaign_id, i.date_start,
      coalesce(i.currency,c.selected_ad_account_currency), i.spend_cents/100.0, i.impressions, i.clicks,
      NULL,NULL,NULL,NULL,NULL,NULL,
      CASE WHEN coalesce(i.video_metrics->>'video_views', i.raw->>'video_views') ~ '^[0-9]+(\.0+)?$'
           THEN (coalesce(i.video_metrics->>'video_views', i.raw->>'video_views'))::numeric END,
      NULL,NULL,NULL,NULL, i.last_synced_at, 'api',
      NULL,
      CASE WHEN i.clicks IS NOT NULL THEN i.spend_cents/100.0 END,
      CASE WHEN i.impressions IS NOT NULL THEN i.spend_cents/100.0 END,
      NULL, NULL
    FROM crm.google_campaign_insights_daily i JOIN conns c ON c.id=i.connection_id AND c.platform='google'
    WHERE i.date_start BETWEEN p_from AND p_to
    UNION ALL
    SELECT 'tiktok', i.connection_id, i.external_campaign_id, i.date_start,
      coalesce(max(i.currency),max(c.selected_ad_account_currency)), sum(i.spend_cents)/100.0, sum(i.impressions), sum(i.clicks),
      NULL,NULL,NULL,NULL,NULL,NULL,NULL,
      sum(i.video_views_2s), sum(i.video_views_6s), sum(i.likes), sum(i.follows),
      max(i.recorded_at), CASE WHEN bool_and(i.source='manual') THEN 'manual' ELSE 'api' END,
      coalesce(sum(i.spend_cents) FILTER (WHERE i.video_views_6s IS NOT NULL),0)/100.0,
      coalesce(sum(i.spend_cents) FILTER (WHERE i.clicks IS NOT NULL),0)/100.0,
      coalesce(sum(i.spend_cents) FILTER (WHERE i.impressions IS NOT NULL),0)/100.0,
      NULL, NULL
    FROM t_lv i JOIN conns c ON c.id=i.connection_id
    WHERE (i.has_c AND i.level='campaign') OR (NOT i.has_c AND i.level='adgroup')
    GROUP BY i.connection_id, i.external_campaign_id, i.date_start
  ),
  cdr AS (
    SELECT z.*, (coalesce(z.spend,0)>0 AND z.spend_ref IS NULL) fx_miss FROM (
      SELECT cd.*, coalesce(k.mc,'?') ctry,
        CASE WHEN coalesce(cd.spend,0)=0 THEN 0 ELSE public.fx_convert(cd.spend, cd.currency, v_ref, cd.dia) END spend_ref
      FROM cd LEFT JOIN cmc k ON k.platform=cd.platform AND k.connection_id=cd.connection_id AND k.cid=cd.cid) z
    WHERE p_country IS NULL OR z.ctry = upper(p_country)
  ),
cm AS (
    SELECT 'meta'::text platform, s.connection_id, s.external_campaign_id cid, s.name nome,
      coalesce(s.effective_status,s.status) st, s.objective objetivo,
      (SELECT string_agg(DISTINCT a.optimization_goal, ',') FROM crm.meta_adset_snapshot a
        WHERE a.connection_id=s.connection_id AND a.external_campaign_id=s.external_campaign_id) otimizacao,
      nullif(s.daily_budget_cents,0)/100.0 orc, s.linked_song_id song, s.last_synced_at leitura_meta
    FROM crm.meta_campaign_snapshot s JOIN conns c ON c.id=s.connection_id
    UNION ALL
    SELECT 'google', g.connection_id, g.external_campaign_id, g.name, g.status, g.advertising_channel_type,
      g.bidding_strategy_type, g.budget_amount_micros/1000000.0, g.linked_song_id, g.last_synced_at
    FROM crm.google_campaign g JOIN conns c ON c.id=g.connection_id
    UNION ALL
    SELECT 'tiktok', t.connection_id, t.external_campaign_id, t.name, t.status, t.objective,
      (SELECT string_agg(DISTINCT coalesce(ag.raw->>'optimization_goal', ag.raw->>'otimizacao'), ',') FROM crm.tiktok_adgroup ag
        WHERE ag.connection_id=t.connection_id AND ag.external_campaign_id=t.external_campaign_id),
      coalesce(nullif(t.budget_cents,0),
        (SELECT nullif(sum(ag.budget_cents),0) FROM crm.tiktok_adgroup ag
          WHERE ag.connection_id=t.connection_id AND ag.external_campaign_id=t.external_campaign_id
            AND upper(coalesce(ag.status,'')) IN ('ENABLE','ACTIVE')))/100.0,
      t.linked_song_id, t.last_synced_at
    FROM crm.tiktok_campaign_carreira t JOIN conns c ON c.id=t.connection_id
  ),

 agg0 AS (SELECT platform,connection_id,cid,round(sum(spend_ref),2) gasto_ref,min(dia) d FROM cdr GROUP BY 1,2,3),
 classified AS (SELECT cp.*, 
      CASE
        WHEN cp.platform='tiktok' AND cp.nome ~* 'visualiza' THEN 'views_6s'
        WHEN cp.platform='tiktok' AND cp.nome ~* 'tr[aá]fego' THEN 'chegada_smart_link'
        WHEN cp.platform='meta' AND cp.nome ~* '^\s*\[mp\]' AND coalesce(cp.objetivo,'') ~* 'traffic|link_clicks' THEN 'chegada_smart_link'
        WHEN cp.platform='meta' AND coalesce(cp.otimizacao,'') ~* 'VISIT_INSTAGRAM_PROFILE|PROFILE_VISIT|PROFILE_AND_PAGE_ENGAGEMENT' THEN 'cliques_perfil'
        WHEN cp.platform='google' AND coalesce(cp.objetivo,'')='VIDEO' AND coalesce(cp.otimizacao,'')='TARGET_CPM' THEN 'impressoes'
      END rtipo,
 NULL::numeric unused FROM (SELECT a.*,m.nome,m.objetivo,m.otimizacao FROM agg0 a LEFT JOIN cm m ON m.platform=a.platform AND m.connection_id=a.connection_id AND m.cid=a.cid) cp),
 events_daily AS MATERIALIZED (SELECT e.created_at::date dia,public.song_link_event_canal(l.canal,e.utm_source,e.utm_medium,e.utm_campaign) canal,count(*) n FROM public.song_link_events e LEFT JOIN public.song_links l ON l.id=e.link_id WHERE e.artist_id=p_artist_id AND e.event='arrival' AND e.created_at>=p_from::timestamptz AND e.created_at<(p_to+1)::timestamptz GROUP BY 1,2),
 platforms AS (SELECT DISTINCT platform FROM conns),
 rows_daily AS (SELECT cdr.platform,cdr.connection_id,cdr.cid,cdr.dia,cdr.currency,cdr.spend,cdr.spend_ref,CASE WHEN c.rtipo='chegada_smart_link' THEN cdr.spend_ref ELSE 0 END gt FROM cdr LEFT JOIN classified c USING(platform,connection_id,cid))
 SELECT jsonb_build_object('ref_currency',v_ref,'plataformas',(SELECT coalesce(jsonb_agg(jsonb_build_object('platform',p.platform,
 'campanhas',(SELECT coalesce(jsonb_agg(jsonb_build_object('campaign_id',c.cid,'account_id',cn.selected_ad_account_id,'gasto_ref',c.gasto_ref,'resultado',jsonb_build_object('nome',c.rtipo))),'[]') FROM classified c JOIN conns cn ON cn.id=c.connection_id WHERE c.platform=p.platform),
 'gasto_trafego',(SELECT coalesce(sum(c.gasto_ref) FILTER(WHERE c.rtipo='chegada_smart_link'),0) FROM classified c WHERE c.platform=p.platform),
 'chegadas',(SELECT sum(n) FROM events_daily WHERE CASE canal WHEN 'meta_ads' THEN 'meta' WHEN 'tiktok_ads' THEN 'tiktok' WHEN 'google_ads' THEN 'google' END=p.platform))),'[]') FROM platforms p),
 'totais',jsonb_build_object('fx_missing_days',(SELECT count(DISTINCT dia) FROM cdr WHERE fx_miss)),
 'daily',(SELECT coalesce(jsonb_agg(jsonb_build_object('dia',r.dia,'plataforma',r.platform,'conta',c.selected_ad_account_id,'moeda',r.currency,'gasto',r.spend,'gasto_ref',r.spend_ref,'gasto_trafego_ref',r.gt)),'[]') FROM rows_daily r JOIN conns c ON c.id=r.connection_id),
 'arrivals_daily',(SELECT coalesce(jsonb_agg(jsonb_build_object('d',dia,'v',n)),'[]') FROM (SELECT dia,sum(n) n FROM events_daily WHERE canal IN ('meta_ads','google_ads','tiktok_ads') GROUP BY dia) z)) INTO v_out;
 RETURN v_out; END $function$
;

CREATE OR REPLACE FUNCTION public._song_growth_summary_initial(p_song_id uuid, p_to date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  s record;
  v_artist_name text;
  v_notas jsonb := '[]'::jsonb;
  v_tec jsonb := '[]'::jsonb;
  v_rep_s text; v_rep_o text;
  g_musica jsonb := '[]'::jsonb;
  g_ugc jsonb := '[]'::jsonb;
  g_redes jsonb := '[]'::jsonb;
  b record; a record;
  spec record;
  v_line jsonb;
  v_pct numeric;
  v_last date; v_c0 numeric; v_c7 numeric; v_c14 numeric;
  v_sem_atual numeric; v_sem_ant numeric;
  v_streams_val numeric; v_streams_date date;
  v_ol jsonb; v_ugc jsonb;
  v_s4a_metric text;
  v_s4a_last date; v_s4a_n int; v_sem_fonte text; v_sem_fim date;
  v_agg_d date[]; v_agg_v numeric[]; v_d7 date; v_d14 date;
BEGIN
  SELECT * INTO s FROM public.artist_songs WHERE id = p_song_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'música inexistente' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.artist_access_check(s.artist_id,'read',NULL);
  SELECT name INTO v_artist_name FROM public.artists WHERE id = s.artist_id;

  IF s.release_date IS NULL THEN
    v_notas := v_notas || to_jsonb('Música sem data de lançamento: os valores iniciais são a primeira leitura disponível.'::text);
    v_tec := v_tec || to_jsonb('release_date NULL: todas as bases são primeira_medicao.'::text);
  END IF;

  FOR spec IN
    SELECT * FROM (VALUES
      ('musica','Spotify','streams','spotify','streams','aggregator','song'),
      ('video_ugc','TikTok','ugc_creators','tiktok','ugc_creators','tiktok_artists','song'),
      ('video_ugc','TikTok','ugc_views','tiktok','ugc_views','tiktok_artists','song'),
      ('video_ugc','TikTok for Artists','ugc_videos_painel','tiktok','ugc_videos','tiktok_artists','song'),
      ('redes','Instagram','seguidores','instagram','followers','aggregator','artist'),
      ('redes','TikTok','seguidores','tiktok','followers','aggregator','artist'),
      ('redes','Spotify','ouvintes_mensais','spotify','monthly_listeners','aggregator','artist'),
      ('redes','YouTube','inscritos','youtube','subscribers','aggregator','artist')
    ) t(grupo, canal, indicador, platform, metric, source, escopo)
  LOOP
    b := NULL; a := NULL;
    IF spec.escopo = 'song' THEN
      SELECT metric_date d, value v, 'lancamento' tipo INTO b FROM public.artist_song_metrics_daily
        WHERE song_id = p_song_id AND platform = spec.platform AND metric = spec.metric AND source = spec.source
          AND s.release_date IS NOT NULL AND metric_date <= s.release_date AND metric_date <= p_to
        ORDER BY metric_date DESC LIMIT 1;
      IF b.d IS NULL THEN
        SELECT metric_date d, value v, 'primeira_medicao' tipo INTO b FROM public.artist_song_metrics_daily
          WHERE song_id = p_song_id AND platform = spec.platform AND metric = spec.metric AND source = spec.source
            AND metric_date <= p_to
          ORDER BY metric_date ASC LIMIT 1;
      END IF;
      SELECT metric_date d, value v INTO a FROM public.artist_song_metrics_daily
        WHERE song_id = p_song_id AND platform = spec.platform AND metric = spec.metric AND source = spec.source
          AND metric_date <= p_to
        ORDER BY metric_date DESC LIMIT 1;
    ELSE
      SELECT metric_date d, value v, 'lancamento' tipo INTO b FROM public.artist_metrics_daily
        WHERE artist_id = s.artist_id AND platform = spec.platform AND metric = spec.metric AND source = spec.source
          AND s.release_date IS NOT NULL AND metric_date <= s.release_date AND metric_date <= p_to
        ORDER BY metric_date DESC LIMIT 1;
      IF b.d IS NULL THEN
        SELECT metric_date d, value v, 'primeira_medicao' tipo INTO b FROM public.artist_metrics_daily
          WHERE artist_id = s.artist_id AND platform = spec.platform AND metric = spec.metric AND source = spec.source
            AND metric_date <= p_to
          ORDER BY metric_date ASC LIMIT 1;
      END IF;
      SELECT metric_date d, value v INTO a FROM public.artist_metrics_daily
        WHERE artist_id = s.artist_id AND platform = spec.platform AND metric = spec.metric AND source = spec.source
          AND metric_date <= p_to
        ORDER BY metric_date DESC LIMIT 1;
    END IF;

    IF b.d IS NULL OR a.d IS NULL OR a.d = b.d THEN
      v_tec := v_tec || to_jsonb(format('%s %s: sem 2 medições em datas diferentes — linha omitida.', spec.canal, spec.indicador));
      CONTINUE;
    END IF;
    v_pct := CASE WHEN b.v = 0 THEN NULL ELSE (a.v - b.v) / b.v * 100 END;
    v_pct := CASE WHEN v_pct IS NULL THEN NULL WHEN abs(v_pct) < 0.1 THEN round(v_pct, 2) ELSE round(v_pct, 1) END;
    v_line := jsonb_build_object('canal', spec.canal, 'indicador', spec.indicador,
      'base', b.v, 'base_data', b.d, 'base_tipo', b.tipo, 'atual', a.v, 'atual_data', a.d,
      'variacao_pct', v_pct, 'source', spec.source, 'base_source', spec.source,
      'precisao', CASE WHEN spec.source = 'tiktok_artists' THEN 'painel_acumulado' ELSE 'serie' END);
    IF spec.grupo = 'musica' THEN g_musica := g_musica || v_line;
    ELSIF spec.grupo = 'video_ugc' THEN g_ugc := g_ugc || v_line;
    ELSE g_redes := g_redes || v_line; END IF;
    IF spec.metric = 'streams' THEN
      v_streams_val := a.v; v_streams_date := a.d;
      IF b.tipo = 'primeira_medicao' THEN
        v_notas := v_notas || to_jsonb(format('Streams medidos desde %s (primeira leitura disponível).', to_char(b.d,'DD/MM')));
      END IF;
    END IF;
    IF spec.indicador = 'ugc_videos_painel' THEN
      v_notas := v_notas || to_jsonb('Publicações no TikTok for Artists: contagem do painel, feita por outro método — não comparar com a do app.'::text);
    END IF;
    IF spec.metric = 'monthly_listeners' THEN
      v_ol := jsonb_build_object('chave','ouvintes_mensais','base',b.v,'atual',a.v,'variacao_pct',v_pct);
    END IF;
  END LOOP;

  FOR v_s4a_metric IN
    SELECT DISTINCT metric FROM public.artist_song_metrics_daily
    WHERE song_id = p_song_id AND metric LIKE 's4a\_%' AND metric_date <= p_to ORDER BY 1
  LOOP
    SELECT metric_date d, value v, source src INTO b FROM public.artist_song_metrics_daily
      WHERE song_id = p_song_id AND metric = v_s4a_metric AND metric_date <= p_to ORDER BY metric_date ASC LIMIT 1;
    SELECT metric_date d, value v, source src INTO a FROM public.artist_song_metrics_daily
      WHERE song_id = p_song_id AND metric = v_s4a_metric AND metric_date <= p_to ORDER BY metric_date DESC LIMIT 1;
    IF a.d = b.d THEN
      v_tec := v_tec || to_jsonb(format('S4A %s: só há registo em %s — linha omitida.', v_s4a_metric, b.d));
      CONTINUE;
    END IF;
    v_pct := CASE WHEN b.v = 0 THEN NULL ELSE (a.v - b.v) / b.v * 100 END;
    v_pct := CASE WHEN v_pct IS NULL THEN NULL WHEN abs(v_pct) < 0.1 THEN round(v_pct, 2) ELSE round(v_pct, 1) END;
    g_musica := g_musica || jsonb_build_object('canal','Spotify for Artists','indicador',v_s4a_metric,
      'base',b.v,'base_data',b.d,'base_tipo','primeira_medicao','atual',a.v,'atual_data',a.d,
      'variacao_pct',v_pct,'source',a.src,'base_source',b.src,'precisao','serie');
  END LOOP;

  WITH pts AS (
    SELECT DISTINCT ON (metric_date) metric_date d, value v, source src, source_ref ref
    FROM public.artist_song_metrics_daily
    WHERE song_id = p_song_id AND platform = 'tiktok' AND metric = 'ugc_videos'
      AND source IN ('ios_shortcut','manual') AND metric_date <= p_to
    ORDER BY metric_date, CASE source WHEN 'ios_shortcut' THEN 0 ELSE 1 END
  )
  SELECT
    (SELECT to_jsonb(x) FROM (SELECT * FROM pts WHERE s.release_date IS NOT NULL AND d <= s.release_date ORDER BY d DESC LIMIT 1) x) AS bl,
    (SELECT to_jsonb(x) FROM (SELECT * FROM pts ORDER BY d ASC LIMIT 1) x) AS bf,
    (SELECT to_jsonb(x) FROM (SELECT * FROM pts ORDER BY d DESC LIMIT 1) x) AS at
  INTO b;
  DECLARE vb jsonb; vt text; va jsonb; bv numeric; av numeric;
  BEGIN
    vb := coalesce(b.bl, b.bf); vt := CASE WHEN b.bl IS NOT NULL THEN 'lancamento' ELSE 'primeira_medicao' END;
    va := b.at;
    IF vb IS NULL OR va IS NULL OR (vb->>'d') = (va->>'d') THEN
      v_tec := v_tec || to_jsonb('TikTok ugc_videos: sem 2 medições em datas diferentes — linha omitida.'::text);
    ELSE
      bv := (vb->>'v')::numeric; av := (va->>'v')::numeric;
      v_pct := CASE WHEN bv = 0 THEN NULL ELSE (av - bv) / bv * 100 END;
      v_pct := CASE WHEN v_pct IS NULL THEN NULL WHEN abs(v_pct) < 0.1 THEN round(v_pct, 2) ELSE round(v_pct, 1) END;
      g_ugc := jsonb_build_object('canal','TikTok','indicador','ugc_videos',
        'base',bv,'base_data',(vb->>'d')::date,'base_tipo',vt,'atual',av,'atual_data',(va->>'d')::date,
        'variacao_pct',v_pct,'source',va->>'src','base_source',vb->>'src',
        'precisao', CASE WHEN va->>'src' = 'ios_shortcut' THEN 'arredondado_app' ELSE 'leitura_manual' END) || g_ugc;
      v_ugc := jsonb_build_object('chave','ugc_videos','base',bv,'atual',av,'variacao_pct',v_pct);
      IF va->>'src' = 'ios_shortcut' THEN
        v_notas := v_notas || to_jsonb('Publicações no TikTok: contagem aproximada do app.'::text);
      END IF;
      IF (vb->>'src') <> (va->>'src') THEN
        v_tec := v_tec || to_jsonb(format('ugc_videos: base %s (%s) e atual %s (%s) — excepção de precedência ios_shortcut > manual.',
          vb->>'d', vb->>'src', va->>'d', va->>'src'));
      END IF;
    END IF;
  END;

  -- Semana de streams: dia com valor igual ao do dia anterior (aggregator) = sem leitura Soundcharts.
  SELECT string_agg(to_char(d,'YYYY-MM-DD'), ', ' ORDER BY d) INTO v_rep_s FROM (
    SELECT metric_date d, value v, lag(value) OVER (ORDER BY metric_date) pv, lag(metric_date) OVER (ORDER BY metric_date) pd
    FROM public.artist_song_metrics_daily
    WHERE song_id=p_song_id AND platform='spotify' AND metric='streams' AND source='aggregator' AND metric_date <= p_to) x
  WHERE pd = d - 1 AND pv = v;
  IF v_rep_s IS NOT NULL THEN
    v_tec := v_tec || to_jsonb(format('streams aggregator: dias repetidos (Soundcharts sem actualização) omitidos: %s.', v_rep_s));
  END IF;
  -- Semana de streams (D-ERP54 adenda 26/09): fonte primária S4A diário (s4a_streams_day), 14 dias seguidos
  -- terminando perto de p_to; senão fallback aggregator por diferença do acumulado (tolerância ±1 dia).
  SELECT max(metric_date) INTO v_s4a_last FROM public.artist_song_metrics_daily
    WHERE song_id=p_song_id AND metric='s4a_streams_day' AND metric_date <= p_to;
  IF v_s4a_last IS NOT NULL AND v_s4a_last >= p_to - 5 THEN
    SELECT count(*), sum(v) FILTER (WHERE d > v_s4a_last-7), sum(v) FILTER (WHERE d <= v_s4a_last-7)
      INTO v_s4a_n, v_sem_atual, v_sem_ant
    FROM (SELECT DISTINCT ON (metric_date) metric_date d, value v FROM public.artist_song_metrics_daily
          WHERE song_id=p_song_id AND metric='s4a_streams_day' AND metric_date BETWEEN v_s4a_last-13 AND v_s4a_last
          ORDER BY metric_date, CASE source WHEN 's4a_api' THEN 0 ELSE 1 END) x;
  END IF;
  IF coalesce(v_s4a_n,0) = 14 THEN
    v_sem_fonte := 's4a_streams_day'; v_sem_fim := v_s4a_last;
    v_notas := v_notas || to_jsonb(format('Streams da semana até %s (Spotify for Artists).', to_char(v_s4a_last,'DD/MM')));
    v_tec := v_tec || to_jsonb(format('streams_semana: fonte s4a_streams_day, %s–%s vs %s–%s (atraso S4A %s dias face a p_to).',
      v_s4a_last-6, v_s4a_last, v_s4a_last-13, v_s4a_last-7, p_to - v_s4a_last));
  ELSE
    v_sem_atual := NULL; v_sem_ant := NULL;
    IF v_s4a_last IS NOT NULL THEN
      v_tec := v_tec || to_jsonb(format('streams_semana: S4A insuficiente (último %s, %s de 14 dias seguidos) — fallback aggregator.', v_s4a_last, coalesce(v_s4a_n,0)));
    ELSE
      v_tec := v_tec || to_jsonb('streams_semana: sem s4a_streams_day — fallback aggregator.'::text);
    END IF;
    SELECT array_agg(d ORDER BY d), array_agg(v ORDER BY d) INTO v_agg_d, v_agg_v FROM (
      SELECT d, v FROM (SELECT metric_date d, value v, lag(value) OVER (ORDER BY metric_date) pv, lag(metric_date) OVER (ORDER BY metric_date) pd
        FROM public.artist_song_metrics_daily WHERE song_id=p_song_id AND platform='spotify' AND metric='streams' AND source='aggregator' AND metric_date <= p_to) x0
      WHERE NOT (pd IS NOT NULL AND pd = d - 1 AND pv = v)) ss;
    IF v_agg_d IS NOT NULL THEN
      v_last := v_agg_d[array_length(v_agg_d,1)];
      v_c0 := v_agg_v[array_length(v_agg_v,1)];
      SELECT dd, vv INTO v_d7, v_c7 FROM unnest(v_agg_d, v_agg_v) u(dd, vv)
        WHERE abs(dd - (v_last-7)) <= 1 ORDER BY abs(dd - (v_last-7)), dd LIMIT 1;
      IF v_d7 IS NOT NULL THEN
        SELECT dd, vv INTO v_d14, v_c14 FROM unnest(v_agg_d, v_agg_v) u(dd, vv)
          WHERE abs(dd - (v_d7-7)) <= 1 ORDER BY abs(dd - (v_d7-7)), dd LIMIT 1;
      END IF;
      v_sem_fonte := 'aggregator_diferenca'; v_sem_fim := v_last;
      v_sem_atual := CASE WHEN v_c7 IS NOT NULL THEN v_c0 - v_c7 END;
      v_sem_ant := CASE WHEN v_c7 IS NOT NULL AND v_c14 IS NOT NULL THEN v_c7 - v_c14 END;
      IF v_d7 IS NOT NULL AND v_d7 <> v_last-7 THEN
        v_tec := v_tec || to_jsonb(format('streams_semana (fallback): %s ausente ou repetido — usado %s (semana de %s dias).', v_last-7, v_d7, v_last - v_d7));
      END IF;
      IF v_d14 IS NOT NULL AND v_d14 <> v_d7-7 THEN
        v_tec := v_tec || to_jsonb(format('streams_semana (fallback): %s ausente ou repetido — usado %s para a semana anterior.', v_d7-7, v_d14));
      END IF;
      IF v_c7 IS NULL THEN
        v_notas := v_notas || to_jsonb(format('Streams da semana não calculados: sem leitura perto de %s.', to_char(v_last-7,'DD/MM')));
        v_tec := v_tec || to_jsonb(format('streams_semana (fallback): sem ponto a ±1 dia de %s — semana atual null.', v_last-7));
      ELSIF v_c14 IS NULL THEN
        v_notas := v_notas || to_jsonb(format('Streams da semana anterior não calculados: sem leitura perto de %s.', to_char(v_d7-7,'DD/MM')));
        v_tec := v_tec || to_jsonb(format('streams_semana (fallback): sem ponto a ±1 dia de %s — semana anterior null.', v_d7-7));
      ELSE
        v_notas := v_notas || to_jsonb(format('Streams da semana até %s.', to_char(v_last,'DD/MM')));
      END IF;
    END IF;
  END IF;
  SELECT string_agg(to_char(d,'YYYY-MM-DD'), ', ' ORDER BY d) INTO v_rep_o FROM (
    SELECT metric_date d, value v, lag(value) OVER (ORDER BY metric_date) pv, lag(metric_date) OVER (ORDER BY metric_date) pd
    FROM public.artist_metrics_daily
    WHERE artist_id=s.artist_id AND platform='spotify' AND metric='monthly_listeners' AND source='aggregator' AND metric_date <= p_to) x
  WHERE pd = d - 1 AND pv = v AND (s.release_date IS NULL OR d >= s.release_date - 7);
  IF v_rep_o IS NOT NULL THEN
    v_tec := v_tec || to_jsonb(format('monthly_listeners aggregator: dias repetidos omitidos da série: %s.', v_rep_o));
  END IF;
  -- D-ERP160: limpeza do grupo musica (só grupos[]; kpis e series intactos).
  DECLARE v_out jsonb := '[]'::jsonb; v_ln jsonb; v_ind text; v_omit_day text[] := '{}'; v_omit_28 text[] := '{}';
    v_mais28 boolean := s.release_date IS NOT NULL AND p_to - s.release_date > 28;
  BEGIN
    FOR v_ln IN SELECT * FROM jsonb_array_elements(g_musica) LOOP
      v_ind := v_ln->>'indicador';
      IF v_ind LIKE 's4a\_%\_day' THEN
        v_omit_day := v_omit_day || v_ind; CONTINUE;
      END IF;
      IF v_mais28 AND v_ind LIKE 's4a\_%\_28d' THEN
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(g_musica) g
                   WHERE g->>'indicador' = regexp_replace(v_ind, '_28d$', '_since_release')
                     AND g->'atual' IS NOT NULL AND g->'atual' <> 'null'::jsonb) THEN
          v_omit_28 := v_omit_28 || v_ind; CONTINUE;
        END IF;
        v_ln := v_ln || jsonb_build_object('janela', '28d');
      END IF;
      v_out := v_out || v_ln;
    END LOOP;
    g_musica := v_out;
    IF array_length(v_omit_day, 1) > 0 THEN
      v_tec := v_tec || to_jsonb(format('grupo musica: omitidas %s — valor de um dia contra base de outro dia não é crescimento (continuam em kpis/series quando usadas).', array_to_string(v_omit_day, ', ')));
    END IF;
    IF array_length(v_omit_28, 1) > 0 THEN
      v_tec := v_tec || to_jsonb(format('grupo musica: música com mais de 28 dias — omitidas %s porque existe a gémea *_since_release com valor; as *_28d sem gémea ficam com janela=28d.', array_to_string(v_omit_28, ', ')));
    END IF;
  END;

  v_pct := CASE WHEN v_sem_ant IS NULL OR v_sem_ant = 0 OR v_sem_atual IS NULL THEN NULL ELSE (v_sem_atual - v_sem_ant) / v_sem_ant * 100 END;
  v_pct := CASE WHEN v_pct IS NULL THEN NULL WHEN abs(v_pct) < 0.1 THEN round(v_pct, 2) ELSE round(v_pct, 1) END;

  RETURN jsonb_build_object(
    'musica', jsonb_build_object('song_id', s.id, 'titulo', s.title,
      'artistas', to_jsonb(ARRAY[v_artist_name] || coalesce(s.featuring, ARRAY[]::text[])),
      'lancamento', s.release_date, 'dias', CASE WHEN s.release_date IS NULL THEN NULL ELSE p_to - s.release_date END),
    'kpis', jsonb_build_array(
      jsonb_build_object('chave','streams_spotify','valor',v_streams_val,'data',v_streams_date),
      jsonb_build_object('chave','streams_semana','valor',v_sem_atual,'anterior',v_sem_ant,'variacao_pct',v_pct,'semana_ate',v_sem_fim,'fonte',v_sem_fonte),
      coalesce(v_ol, jsonb_build_object('chave','ouvintes_mensais','base',null,'atual',null,'variacao_pct',null)),
      coalesce(v_ugc, jsonb_build_object('chave','ugc_videos','base',null,'atual',null,'variacao_pct',null))),
    'grupos', jsonb_build_array(
      jsonb_build_object('grupo','musica','linhas',g_musica),
      jsonb_build_object('grupo','video_ugc','linhas',g_ugc),
      jsonb_build_object('grupo','redes','linhas',g_redes)),
    'series', jsonb_build_object(
      'streams_acumulados', coalesce((SELECT jsonb_agg(jsonb_build_object('d',d,'v',v) ORDER BY d) FROM (SELECT d, v FROM (SELECT metric_date d, value v, lag(value) OVER (ORDER BY metric_date) pv, lag(metric_date) OVER (ORDER BY metric_date) pd FROM public.artist_song_metrics_daily WHERE song_id=p_song_id AND platform='spotify' AND metric='streams' AND source='aggregator' AND metric_date <= p_to) x0 WHERE NOT (pd IS NOT NULL AND pd = d - 1 AND pv = v)) ss), '[]'::jsonb),
      'ouvintes_mensais', coalesce((SELECT jsonb_agg(jsonb_build_object('d',d,'v',v) ORDER BY d) FROM (
          SELECT metric_date d, value v, lag(value) OVER (ORDER BY metric_date) pv, lag(metric_date) OVER (ORDER BY metric_date) pd
          FROM public.artist_metrics_daily WHERE artist_id=s.artist_id AND platform='spotify' AND metric='monthly_listeners' AND source='aggregator'
            AND metric_date <= p_to) x
          WHERE NOT (pd IS NOT NULL AND pd = d - 1 AND pv = v) AND (s.release_date IS NULL OR d >= s.release_date - 7)), '[]'::jsonb)),
    'notas', v_notas,
    'notas_tecnicas', v_tec,
    'gerado_em', now());
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_access_check(p_artist_id uuid, p_need text DEFAULT 'read'::text, p_area text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_company uuid; v_role text; a record;
BEGIN
  IF p_need NOT IN ('read','traffic_write','admin') THEN RAISE EXCEPTION 'p_need inválido'; END IF;
  SELECT company_id INTO v_company FROM public.artists WHERE id = p_artist_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'artista inexistente ou sem empresa' USING ERRCODE='42501'; END IF;
  IF v_uid IS NULL THEN
    IF coalesce(auth.role(),'') = 'service_role' OR session_user IN ('postgres','supabase_admin') THEN RETURN v_company; END IF;
    RAISE EXCEPTION 'sessão obrigatória' USING ERRCODE='42501';
  END IF;
  IF public.has_role(v_uid,'platform_admin'::app_role) THEN RETURN v_company; END IF;
  SELECT CASE WHEN bool_or(role='admin') THEN 'admin'
              WHEN bool_or(role IN ('manager','marketing_manager')) THEN 'traffic'
              WHEN count(*) > 0 THEN 'read' END
    INTO v_role FROM public.user_roles
   WHERE user_id = v_uid AND company_id = v_company AND role <> 'user';
  IF v_role = 'admin' THEN RETURN v_company; END IF;
  IF v_role = 'traffic' AND p_need IN ('read','traffic_write') THEN RETURN v_company; END IF;
  IF v_role = 'read' AND p_need = 'read' THEN RETURN v_company; END IF;
  SELECT access_level, areas INTO a FROM public.artist_user_access
   WHERE user_id = v_uid AND artist_id = p_artist_id AND revoked_at IS NULL;
  IF FOUND THEN
    IF p_need = 'read' AND (p_area IS NULL OR p_area = ANY(a.areas) OR (a.access_level='traffic_manager' AND p_area='traffic')) THEN RETURN v_company; END IF;
    IF p_need = 'traffic_write' AND a.access_level = 'traffic_manager' THEN RETURN v_company; END IF;
  END IF;
  RAISE EXCEPTION 'sem acesso a este artista' USING ERRCODE='42501';
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_access_grant(p_user_id uuid, p_artist_id uuid, p_level text, p_areas text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  PERFORM public.artist_access_check(p_artist_id,'admin');
  INSERT INTO public.artist_user_access(user_id,artist_id,company_id,access_level,areas,granted_by)
  VALUES (p_user_id,p_artist_id,'00000000-0000-0000-0000-000000000000',p_level,coalesce(p_areas,ARRAY['overview']),auth.uid())
  ON CONFLICT (user_id,artist_id) DO UPDATE SET access_level=EXCLUDED.access_level, areas=EXCLUDED.areas,
    granted_by=EXCLUDED.granted_by, granted_at=now(), revoked_at=NULL
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_access_ok(p_artist_id uuid, p_need text DEFAULT 'read'::text, p_area text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN PERFORM public.artist_access_check(p_artist_id,p_need,p_area); RETURN true;
EXCEPTION WHEN insufficient_privilege THEN RETURN false; END $function$
;

CREATE OR REPLACE FUNCTION public.artist_access_revoke(p_user_id uuid, p_artist_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.artist_access_check(p_artist_id,'admin');
  UPDATE public.artist_user_access SET revoked_at=now() WHERE user_id=p_user_id AND artist_id=p_artist_id AND revoked_at IS NULL;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_ads(p_artist_id uuid, p_campaign_id text DEFAULT NULL::text, p_platform text DEFAULT 'meta'::text)
 RETURNS TABLE(platform text, connection_id uuid, currency text, campaign_id text, campaign_name text, adset_id text, adset_name text, ad_id text, ad_name text, status text, creative_id text, thumbnail_url text, permalink text, spend_7d numeric, impressions_7d bigint, clicks_7d bigint, ctr_7d numeric, cpc_7d numeric, video_3s_views_7d bigint, thruplays_7d bigint, cost_per_thruplay_7d numeric, spend_30d numeric, impressions_30d bigint, clicks_30d bigint, ctr_30d numeric, cpc_30d numeric, video_3s_views_30d bigint, thruplays_30d bigint, cost_per_thruplay_30d numeric, linked_song_id uuid, last_synced_at timestamp with time zone, ref_currency text, spend_7d_ref numeric, spend_30d_ref numeric, fx_missing_days integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  WITH guard AS (SELECT public.artist_access_check(p_artist_id,'read','traffic') AS company_id),
  plat AS (SELECT lower(coalesce(p_platform,'meta')) AS p),
  ref AS (
    SELECT coalesce(a.reporting_currency, co.currency) AS ref_currency
    FROM public.artists a LEFT JOIN public.companies co ON co.id = a.company_id
    WHERE a.id = p_artist_id
  ),
  conns AS (
    SELECT c.* FROM crm.ad_platform_connections c, guard g, plat
    WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id
      AND c.company_id = g.company_id AND c.platform = 'meta' AND plat.p = 'meta'
  ),
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
    WHERE (upper(coalesce(a.effective_status, a.status, '')) NOT IN ('DELETED','ARCHIVED')
           OR coalesce(i.spend_30d,0) > 0)
      AND (p_campaign_id IS NULL OR coalesce(a.external_campaign_id, i.external_campaign_id) = p_campaign_id)
  ),
  conns_g AS (
    SELECT c.* FROM crm.ad_platform_connections c, guard g, plat
    WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id
      AND c.company_id = g.company_id AND c.platform = 'google' AND plat.p = 'google'
  ),
  ins_g AS (
    SELECT i.connection_id, i.external_ad_id,
      (array_agg(i.external_adset_id ORDER BY i.date_start DESC) FILTER (WHERE nullif(i.external_adset_id,'') IS NOT NULL))[1] AS external_ad_group_id,
      (array_agg(i.external_campaign_id ORDER BY i.date_start DESC) FILTER (WHERE nullif(i.external_campaign_id,'') IS NOT NULL))[1] AS external_campaign_id,
      (array_agg(i.campaign_name ORDER BY i.date_start DESC) FILTER (WHERE i.campaign_name IS NOT NULL))[1] AS campaign_name,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_7d,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN coalesce(i.impressions,0) ELSE 0 END) AS impressions_7d,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN coalesce(i.clicks,0) ELSE 0 END) AS clicks_7d,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN coalesce(i.video_thruplays,0) ELSE 0 END) AS thru_7d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.impressions,0) ELSE 0 END) AS impressions_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.clicks,0) ELSE 0 END) AS clicks_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.video_thruplays,0) ELSE 0 END) AS thru_30d,
      (array_agg(i.currency ORDER BY i.date_start DESC) FILTER (WHERE i.currency IS NOT NULL))[1] AS currency,
      max(i.last_synced_at) AS last_synced_at,
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
    FROM crm.ads_insights_breakdown_daily i
    JOIN conns_g c ON c.id = i.connection_id
    CROSS JOIN ref r
    WHERE i.platform = 'google' AND i.level = 'ad' AND i.breakdown = 'none'
      AND i.date_start >= current_date - 29
    GROUP BY 1,2
  ),
  keys_g AS (
    SELECT i.connection_id, i.external_ad_id FROM ins_g i
    UNION
    SELECT a.connection_id, a.external_ad_id
    FROM crm.google_ad a JOIN conns_g c ON c.id = a.connection_id
  ),
  base_g AS (
    SELECT
      'google'::text AS platform,
      c.id AS connection_id,
      coalesce(i.currency, c.selected_ad_account_currency) AS currency,
      coalesce(a.external_campaign_id, i.external_campaign_id) AS campaign_id,
      coalesce(gc.name, i.campaign_name) AS campaign_name,
      coalesce(nullif(a.external_ad_group_id,''), i.external_ad_group_id) AS adset_id,
      gg.name AS adset_name,
      k.external_ad_id AS ad_id,
      coalesce(a.name, a.youtube_video_title) AS ad_name,
      a.status AS status,
      a.youtube_video_id AS creative_id,
      CASE WHEN nullif(a.youtube_video_id,'') IS NOT NULL
           THEN 'https://i.ytimg.com/vi/' || a.youtube_video_id || '/hqdefault.jpg' END AS thumbnail_url,
      CASE WHEN nullif(a.youtube_video_id,'') IS NOT NULL
           THEN 'https://www.youtube.com/watch?v=' || a.youtube_video_id END AS permalink,
      coalesce(i.spend_7d,0) AS spend_7d,
      coalesce(i.impressions_7d,0)::bigint AS impressions_7d,
      coalesce(i.clicks_7d,0)::bigint AS clicks_7d,
      NULL::bigint AS video_3s_views_7d,
      i.thru_7d::bigint AS thruplays_7d,
      coalesce(i.spend_30d,0) AS spend_30d,
      coalesce(i.impressions_30d,0)::bigint AS impressions_30d,
      coalesce(i.clicks_30d,0)::bigint AS clicks_30d,
      NULL::bigint AS video_3s_views_30d,
      i.thru_30d::bigint AS thruplays_30d,
      gc.linked_song_id AS linked_song_id,
      coalesce(a.last_synced_at, i.last_synced_at) AS last_synced_at,
      i.spend_7d_ref AS spend_7d_ref,
      i.spend_30d_ref AS spend_30d_ref,
      coalesce(i.fx_missing_days,0) AS fx_missing_days
    FROM keys_g k
    JOIN conns_g c ON c.id = k.connection_id
    LEFT JOIN ins_g i ON i.connection_id = k.connection_id AND i.external_ad_id = k.external_ad_id
    LEFT JOIN crm.google_ad a ON a.connection_id = k.connection_id AND a.external_ad_id = k.external_ad_id
    LEFT JOIN crm.google_ad_group gg
      ON gg.connection_id = c.id AND gg.external_ad_group_id = coalesce(nullif(a.external_ad_group_id,''), i.external_ad_group_id)
    LEFT JOIN crm.google_campaign gc
      ON gc.connection_id = c.id AND gc.external_campaign_id = coalesce(a.external_campaign_id, i.external_campaign_id)
    WHERE (upper(coalesce(a.status,'')) NOT IN ('REMOVED') OR coalesce(i.spend_30d,0) > 0)
      AND (p_campaign_id IS NULL OR coalesce(a.external_campaign_id, i.external_campaign_id) = p_campaign_id)
  ),
  todos AS (SELECT * FROM base UNION ALL SELECT * FROM base_g)
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
  FROM todos b
  ORDER BY b.spend_30d DESC, b.ad_name NULLS LAST
$function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_alerts(p_artist_id uuid)
 RETURNS TABLE(platform text, kind text, severity text, message text, campaign_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  WITH guard AS (SELECT public.artist_access_check(p_artist_id,'read','traffic') AS company_id),
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
  UNION ALL
  SELECT t.platform, t.kind, t.severity, t.message, t.campaign_id
  FROM guard, crm.artist_ads_tiktok_alerts_core(p_artist_id) t
$function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_assert_access(p_artist_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT public.artist_access_check(p_artist_id,'read',NULL) $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_autolink_songs(p_artist_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_access_check(p_artist_id,'traffic_write',NULL);
  RETURN crm.artist_ads_autolink_songs_core(p_artist_id, v_company);
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_breakdowns(p_artist_id uuid, p_days integer DEFAULT 30, p_platform text DEFAULT NULL::text, p_breakdown text DEFAULT NULL::text)
 RETURNS TABLE(platform text, breakdown text, breakdown_value text, impressions bigint, clicks bigint, spend numeric, currency text, quota numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  with guard as (select public.artist_access_check(p_artist_id,'read','traffic') as company_id),
  conns as (
    select c.id, c.platform from crm.ad_platform_connections c, guard g
    where c.connection_scope = 'artist' and c.artist_id = p_artist_id and c.company_id = g.company_id
      and (p_platform is null or c.platform = p_platform)
  ),
  base as (
    select b.platform, b.breakdown, b.breakdown_value,
           sum(coalesce(b.impressions,0))::bigint as impressions, sum(coalesce(b.clicks,0))::bigint as clicks,
           sum(coalesce(b.spend_cents,0))/100.0 as spend, max(b.currency) as currency
    from crm.ads_insights_breakdown_daily b join conns c on c.id = b.connection_id
    where b.date_start >= current_date - (greatest(coalesce(p_days,30),1) - 1)
      and (p_breakdown is null or b.breakdown = p_breakdown)
    group by 1,2,3
  )
  select b.platform, b.breakdown, b.breakdown_value, b.impressions, b.clicks, b.spend, b.currency,
         round(100.0 * b.impressions / nullif(sum(b.impressions) over (partition by b.platform, b.breakdown), 0), 1) as quota
  from base b order by b.platform, b.breakdown, b.impressions desc
$function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_budget_cap_get(p_artist_id uuid)
 RETURNS TABLE(platform text, connection_id uuid, account_id text, account_name text, account_currency text, status text, has_cap boolean, daily_cap numeric, cap_currency text, set_at timestamp with time zone, committed_daily numeric, available_daily numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_access_check(p_artist_id,'read','traffic');
  RETURN QUERY
  SELECT c.platform, c.id, c.selected_ad_account_id, c.selected_ad_account_name,
         c.selected_ad_account_currency, c.status,
         (b.id IS NOT NULL), b.daily_cap, b.currency, b.set_at,
         coalesce(comp.total, 0)::numeric,
         CASE WHEN b.id IS NULL THEN NULL ELSE b.daily_cap - coalesce(comp.total, 0) END
  FROM crm.ad_platform_connections c
  LEFT JOIN crm.artist_ads_budget_caps b ON b.connection_id = c.id
  LEFT JOIN LATERAL (
    SELECT sum(crm.artist_ads_plan_daily(p.adsets, p.start_time, p.end_time)) AS total
    FROM crm.meta_publish_plan p
    WHERE p.connection_id = c.id AND p.song_id IS NOT NULL
      AND p.estado IN ('publicado','ativo')
  ) comp ON true
  WHERE c.connection_scope = 'artist'
    AND c.artist_id = p_artist_id
    AND c.company_id = v_company
  ORDER BY c.platform, c.selected_ad_account_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_budget_cap_remove(p_connection_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_company uuid; v_artist uuid;
BEGIN
  SELECT company_id, artist_id INTO v_company, v_artist FROM crm.ad_platform_connections
  WHERE id = p_connection_id AND connection_scope = 'artist';
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'ligação de anúncios de artista inexistente' USING ERRCODE = '42501';
  END IF;
  PERFORM public.artist_access_check(v_artist,'admin',NULL);
  DELETE FROM crm.artist_ads_budget_caps WHERE connection_id = p_connection_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_budget_cap_set(p_connection_id uuid, p_daily_cap numeric, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_conn crm.ad_platform_connections; v_id uuid;
BEGIN
  SELECT * INTO v_conn FROM crm.ad_platform_connections
  WHERE id = p_connection_id AND connection_scope = 'artist';
  IF v_conn.id IS NULL THEN
    RAISE EXCEPTION 'ligação de anúncios de artista inexistente' USING ERRCODE = '42501';
  END IF;
  PERFORM public.artist_access_check(v_conn.artist_id,'admin',NULL);
  IF v_conn.selected_ad_account_currency IS NULL THEN
    RAISE EXCEPTION 'a conta ainda não tem moeda definida' USING ERRCODE = '22023';
  END IF;
  IF p_daily_cap IS NULL OR p_daily_cap <= 0 THEN
    RAISE EXCEPTION 'o teto diário tem de ser maior que zero' USING ERRCODE = '22023';
  END IF;

  INSERT INTO crm.artist_ads_budget_caps
    (company_id, artist_id, connection_id, platform, daily_cap, currency, notes, set_by, set_at)
  VALUES (v_conn.company_id, v_conn.artist_id, v_conn.id, v_conn.platform,
          p_daily_cap, upper(v_conn.selected_ad_account_currency), p_notes, auth.uid(), now())
  ON CONFLICT (connection_id) DO UPDATE
    SET daily_cap = EXCLUDED.daily_cap,
        currency = EXCLUDED.currency,
        notes = EXCLUDED.notes,
        set_by = EXCLUDED.set_by,
        set_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_campaign_goal_list(p_artist_id uuid)
 RETURNS SETOF artist_ads_campaign_goals
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_access_check(p_artist_id,'read','traffic');
  RETURN QUERY SELECT * FROM public.artist_ads_campaign_goals g
   WHERE g.artist_id = p_artist_id AND g.company_id = v_company
   ORDER BY g.platform, g.external_campaign_id, g.valido_desde DESC;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_campaign_goal_upsert(p_artist_id uuid, p_platform text, p_external_campaign_id text, p_nivel text, p_external_adgroup_id text, p_resultado_nome text, p_meta_tipo text, p_meta_valor numeric, p_moeda text, p_notas text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_company uuid; v_id uuid; v_nivel text := coalesce(nullif(p_nivel,''),'campaign');
BEGIN
  v_company := public.artist_access_check(p_artist_id,'traffic_write',NULL);
  IF nullif(trim(p_external_campaign_id),'') IS NULL THEN RAISE EXCEPTION 'campanha obrigatória' USING ERRCODE='22023'; END IF;
  IF p_meta_valor IS NULL OR p_meta_valor <= 0 THEN RAISE EXCEPTION 'meta_valor tem de ser > 0' USING ERRCODE='22023'; END IF;
  IF v_nivel = 'adgroup' AND nullif(trim(p_external_adgroup_id),'') IS NULL THEN
    RAISE EXCEPTION 'nível adgroup exige external_adgroup_id' USING ERRCODE='22023'; END IF;
  UPDATE public.artist_ads_campaign_goals SET
    resultado_nome = p_resultado_nome, meta_tipo = p_meta_tipo, meta_valor = p_meta_valor,
    moeda = upper(p_moeda), notas = p_notas, origem = 'pedro', artist_id = p_artist_id
  WHERE company_id = v_company AND platform = p_platform AND external_campaign_id = p_external_campaign_id
    AND nivel = v_nivel AND external_adgroup_id IS NOT DISTINCT FROM nullif(trim(p_external_adgroup_id),'')
    AND valido_desde = current_date
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    INSERT INTO public.artist_ads_campaign_goals (company_id, artist_id, platform, external_campaign_id, nivel,
      external_adgroup_id, resultado_nome, meta_tipo, meta_valor, moeda, origem, notas)
    VALUES (v_company, p_artist_id, p_platform, p_external_campaign_id, v_nivel,
      nullif(trim(p_external_adgroup_id),''), p_resultado_nome, p_meta_tipo, p_meta_valor, upper(p_moeda), 'pedro', p_notas)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_campaign_settings(p_artist_id uuid, p_campaign_id text, p_platform text DEFAULT 'meta'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE
  v_company uuid := public.artist_access_check(p_artist_id,'read','traffic');
  v_plat text := lower(coalesce(p_platform,'meta'));
  v_conn crm.ad_platform_connections%rowtype;
  v_out jsonb;
BEGIN
  SELECT c.* INTO v_conn FROM crm.ad_platform_connections c
  WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id
    AND c.company_id = v_company AND c.platform = v_plat
  ORDER BY (CASE WHEN v_plat = 'google'
                 THEN EXISTS (SELECT 1 FROM crm.google_campaign g
                              WHERE g.connection_id = c.id AND g.external_campaign_id = p_campaign_id)
                 ELSE EXISTS (SELECT 1 FROM crm.meta_campaign_snapshot m
                              WHERE m.connection_id = c.id AND m.external_campaign_id = p_campaign_id)
            END) DESC,
           (lower(coalesce(c.status,'')) = 'active') DESC, c.connected_at DESC NULLS LAST
  LIMIT 1;

  IF v_conn.id IS NULL THEN
    RAISE EXCEPTION 'sem ligação % para este artista', v_plat USING ERRCODE = 'P0002';
  END IF;

  IF v_plat = 'google' THEN
    SELECT jsonb_build_object(
      'plataforma', 'google',
      'campanha', jsonb_build_object(
        'id', gc.external_campaign_id,
        'nome', gc.name,
        'estado', gc.status,
        'objetivo', gc.advertising_channel_type,
        'sub_tipo', gc.settings->'campanha'->'videoCampaignSettings',
        'orcamento', jsonb_build_object(
          'tipo', 'diario',
          'valor', round(gc.budget_amount_micros/1000000.0, 2),
          'moeda', coalesce(v_conn.selected_ad_account_currency, 'BRL')),
        'lance', gc.bidding_strategy_type,
        'inicio', gc.start_date, 'fim', gc.end_date),
      'geografia', jsonb_build_object(
        'incluidos', coalesce((SELECT jsonb_agg(c->'localizacao'->>'nome_canonico')
                               FROM jsonb_array_elements(gc.settings->'criterios') c
                               WHERE c->>'tipo' = 'LOCATION' AND (c->>'negativo')::boolean IS NOT TRUE), '[]'::jsonb),
        'excluidos', coalesce((SELECT jsonb_agg(c->'localizacao'->>'nome_canonico')
                               FROM jsonb_array_elements(gc.settings->'criterios') c
                               WHERE c->>'tipo' = 'LOCATION' AND (c->>'negativo')::boolean IS TRUE), '[]'::jsonb)),
      'idiomas', coalesce((SELECT jsonb_agg(c->>'lingua') FROM jsonb_array_elements(gc.settings->'criterios') c
                           WHERE c->>'tipo' = 'LANGUAGE'), '[]'::jsonb),
      'idades', coalesce((SELECT jsonb_agg(c->>'faixa_etaria') FROM jsonb_array_elements(gc.settings->'criterios') c
                          WHERE c->>'tipo' = 'AGE_RANGE'), '[]'::jsonb),
      'generos', coalesce((SELECT jsonb_agg(c->>'genero') FROM jsonb_array_elements(gc.settings->'criterios') c
                           WHERE c->>'tipo' = 'GENDER'), '[]'::jsonb),
      'dispositivos', coalesce((SELECT jsonb_agg(c->>'dispositivo') FROM jsonb_array_elements(gc.settings->'criterios') c
                                WHERE c->>'tipo' = 'DEVICE'), '[]'::jsonb),
      'limite_frequencia', gc.settings->'campanha'->'frequencyCaps',
      'formatos', gc.settings->'campanha'->'videoCampaignSettings'->'videoAdInventoryControl',
      'alcance', gc.reach,
      'fonte', jsonb_build_object('tabela', 'crm.google_campaign',
                                  'data', gc.settings->>'recolhido_em',
                                  'api', gc.settings->>'api_version')
    ) INTO v_out
    FROM crm.google_campaign gc
    WHERE gc.connection_id = v_conn.id AND gc.external_campaign_id = p_campaign_id;
  ELSE
    SELECT jsonb_build_object(
      'plataforma', 'meta',
      'campanha', jsonb_build_object(
        'id', mc.external_campaign_id,
        'nome', mc.name,
        'estado', coalesce(mc.effective_status, mc.status),
        'objetivo', mc.objective,
        'sub_tipo', NULL,
        'orcamento', jsonb_build_object(
          'tipo', CASE WHEN coalesce(s.lifetime_budget_cents,0) > 0 THEN 'vitalicio' ELSE 'diario' END,
          'valor', round(coalesce(nullif(s.lifetime_budget_cents,0), s.daily_budget_cents, 0)/100.0, 2),
          'moeda', coalesce(s.currency, v_conn.selected_ad_account_currency)),
        'lance', s.bid_strategy,
        'inicio', s.start_time, 'fim', s.end_time),
      'geografia', jsonb_build_object(
        'incluidos', coalesce(s.targeting->'geo_locations', '{}'::jsonb),
        'excluidos', coalesce(s.targeting->'excluded_geo_locations', '{}'::jsonb)),
      'idiomas', coalesce(s.targeting->'locales', '[]'::jsonb),
      'idades', jsonb_build_object('min', s.targeting->'age_min', 'max', s.targeting->'age_max'),
      'generos', coalesce(s.targeting->'genders', '[]'::jsonb),
      'dispositivos', coalesce(s.targeting->'device_platforms', '[]'::jsonb),
      'limite_frequencia', s.raw->'frequency_control_specs',
      'formatos', coalesce(s.targeting->'publisher_platforms', '[]'::jsonb),
      'alcance', NULL,
      'fonte', jsonb_build_object('tabela', 'crm.meta_adset_snapshot', 'data', s.last_synced_at)
    ) INTO v_out
    FROM crm.meta_campaign_snapshot mc
    LEFT JOIN LATERAL (
      SELECT * FROM crm.meta_adset_snapshot a
      WHERE a.connection_id = mc.connection_id AND a.external_campaign_id = mc.external_campaign_id
      ORDER BY a.last_synced_at DESC NULLS LAST LIMIT 1
    ) s ON true
    WHERE mc.connection_id = v_conn.id AND mc.external_campaign_id = p_campaign_id;
  END IF;

  IF v_out IS NULL THEN
    RAISE EXCEPTION 'campanha % não encontrada em %', p_campaign_id, v_plat USING ERRCODE = 'P0002';
  END IF;
  RETURN v_out;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_campaigns(p_artist_id uuid, p_include_removed boolean DEFAULT false, p_country text DEFAULT NULL::text)
 RETURNS TABLE(platform text, connection_id uuid, connection_status text, account_id text, account_name text, currency text, campaign_id text, campaign_name text, status text, objective text, budget_daily numeric, start_date date, end_date date, spend_7d numeric, spend_30d numeric, impressions_30d bigint, clicks_30d bigint, video_views_30d bigint, results_30d numeric, cpc_30d numeric, cpv_30d numeric, last_synced_at timestamp with time zone, linked_song_id uuid, linked_event_id uuid, ref_currency text, spend_7d_ref numeric, spend_30d_ref numeric, fx_missing_days integer, data_source text, last_recorded_at timestamp with time zone, link_kind text, market_country text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  WITH guard AS (SELECT public.artist_access_check(p_artist_id,'read','traffic') AS company_id),
  ref AS (
    SELECT coalesce(a.reporting_currency, co.currency) AS ref_currency
    FROM public.artists a LEFT JOIN public.companies co ON co.id = a.company_id
    WHERE a.id = p_artist_id
  ),
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
      sum(CASE WHEN i.date_start >= current_date - 29 AND coalesce(i.video_metrics->>'video_views', i.raw->>'video_views') ~ '^[0-9]+$'
               THEN (coalesce(i.video_metrics->>'video_views', i.raw->>'video_views'))::bigint ELSE 0 END) AS video_views_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.conversions ELSE 0 END) AS results_30d,
      (array_agg(i.currency ORDER BY i.date_start DESC) FILTER (WHERE i.currency IS NOT NULL))[1] AS currency,
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
    FROM crm.google_campaign_insights_daily i
    JOIN conns c ON c.id = i.connection_id
    CROSS JOIN ref r
    WHERE c.platform = 'google'
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
               THEN coalesce(i.purchases_count,0) + coalesce(i.leads_count,0) ELSE 0 END)::numeric AS results_30d,
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
    FROM crm.meta_campaign_insights_daily i
    JOIN conns c ON c.id = i.connection_id
    CROSS JOIN ref r
    WHERE c.platform = 'meta'
    GROUP BY 1,2
  ),
  t_lv AS (
    SELECT i.*, bool_or(i.level = 'campaign') OVER (PARTITION BY i.connection_id, i.external_campaign_id, i.date_start) AS has_c
    FROM crm.tiktok_insights_daily_carreira i
    JOIN conns c ON c.id = i.connection_id AND c.platform = 'tiktok'
    WHERE i.level IN ('campaign','adgroup')
  ),
  t_day AS (SELECT * FROM t_lv WHERE (has_c AND level = 'campaign') OR (NOT has_c AND level = 'adgroup')),
  t_ins AS (
    SELECT i.connection_id, i.external_campaign_id,
      sum(CASE WHEN i.date_start >= current_date - 6 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_7d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.spend_cents ELSE 0 END)/100.0 AS spend_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.impressions ELSE 0 END) AS impressions_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN i.clicks ELSE 0 END) AS clicks_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.video_views_6s, i.video_views_2s, 0) ELSE 0 END) AS video_views_30d,
      sum(CASE WHEN i.date_start >= current_date - 29 THEN coalesce(i.video_views_6s,0) ELSE 0 END)::numeric AS results_30d,
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
      )::integer AS fx_missing_days,
      CASE WHEN bool_and(i.source = 'api') THEN 'api' WHEN bool_and(i.source = 'manual') THEN 'manual' ELSE 'mixed' END AS data_source,
      max(i.recorded_at) AS last_recorded_at
    FROM t_day i
    JOIN conns c ON c.id = i.connection_id
    CROSS JOIN ref r
    GROUP BY 1,2
  ),
  allrows AS (
    SELECT 'google'::text AS platform, c.id AS connection_id, c.status AS connection_status,
      c.selected_ad_account_id AS account_id, c.selected_ad_account_name AS account_name,
      coalesce(c.selected_ad_account_currency, i.currency) AS currency,
      gc.external_campaign_id AS campaign_id, gc.name AS campaign_name, gc.status AS status,
      gc.advertising_channel_type AS objective,
      gc.budget_amount_micros / 1000000.0 AS budget_daily,
      gc.start_date AS start_date, gc.end_date AS end_date,
      coalesce(i.spend_7d,0) AS spend_7d, coalesce(i.spend_30d,0) AS spend_30d,
      coalesce(i.impressions_30d,0)::bigint AS impressions_30d, coalesce(i.clicks_30d,0)::bigint AS clicks_30d,
      coalesce(i.video_views_30d,0)::bigint AS video_views_30d, coalesce(i.results_30d,0) AS results_30d,
      gc.last_synced_at AS last_synced_at, gc.linked_song_id AS linked_song_id, gc.linked_event_id AS linked_event_id,
      i.spend_7d_ref AS spend_7d_ref, i.spend_30d_ref AS spend_30d_ref,
      coalesce(i.fx_missing_days,0) AS fx_missing_days,
      'api'::text AS data_source, gc.last_synced_at AS last_recorded_at,
      gc.link_kind AS link_kind, gc.market_country AS market_country
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
      ms.last_synced_at, ms.linked_song_id, ms.linked_event_id,
      i.spend_7d_ref, i.spend_30d_ref, coalesce(i.fx_missing_days,0),
      'api'::text, ms.last_synced_at,
      ms.link_kind, ms.market_country
    FROM conns c
    JOIN crm.meta_campaign_snapshot ms ON ms.connection_id = c.id
    LEFT JOIN m_ins i ON i.connection_id = ms.connection_id AND i.external_campaign_id = ms.external_campaign_id
    WHERE c.platform = 'meta'
      AND (p_include_removed OR upper(coalesce(ms.effective_status, ms.status,'')) NOT IN ('DELETED','REMOVED','ARCHIVED'))
    UNION ALL
    SELECT 'tiktok'::text, c.id, c.status,
      c.selected_ad_account_id, c.selected_ad_account_name,
      coalesce(tc.currency, c.selected_ad_account_currency),
      tc.external_campaign_id, tc.name,
      CASE upper(coalesce(tc.status,'')) WHEN 'ENABLE' THEN 'ACTIVE' WHEN 'DISABLE' THEN 'PAUSED'
        WHEN 'DELETE' THEN 'DELETED' ELSE tc.status END,
      tc.objective,
      coalesce(nullif(tc.budget_cents,0),
        (SELECT sum(ag.budget_cents) FROM crm.tiktok_adgroup ag
          WHERE ag.connection_id = tc.connection_id AND ag.external_campaign_id = tc.external_campaign_id
            AND upper(coalesce(ag.status,'')) IN ('ENABLE','ACTIVE')), 0) / 100.0,
      NULL::date, NULL::date,
      coalesce(i.spend_7d,0), coalesce(i.spend_30d,0),
      coalesce(i.impressions_30d,0)::bigint, coalesce(i.clicks_30d,0)::bigint,
      coalesce(i.video_views_30d,0)::bigint, coalesce(i.results_30d,0),
      tc.last_synced_at, tc.linked_song_id, NULL::uuid,
      i.spend_7d_ref, i.spend_30d_ref, coalesce(i.fx_missing_days,0),
      coalesce(i.data_source, tc.source), coalesce(i.last_recorded_at, tc.last_synced_at),
      tc.link_kind, tc.market_country
    FROM conns c
    JOIN crm.tiktok_campaign_carreira tc ON tc.connection_id = c.id
    LEFT JOIN t_ins i ON i.connection_id = tc.connection_id AND i.external_campaign_id = tc.external_campaign_id
    WHERE c.platform = 'tiktok'
      AND (p_include_removed OR upper(coalesce(tc.status,'')) NOT IN ('DELETE','DELETED','REMOVED'))
  )
  SELECT r.platform, r.connection_id, r.connection_status, r.account_id, r.account_name, r.currency,
    r.campaign_id, r.campaign_name, r.status, r.objective, r.budget_daily, r.start_date, r.end_date,
    r.spend_7d, r.spend_30d, r.impressions_30d, r.clicks_30d, r.video_views_30d, r.results_30d,
    CASE WHEN r.clicks_30d > 0 THEN round(r.spend_30d / r.clicks_30d, 4) END,
    CASE WHEN r.video_views_30d > 0 THEN round(r.spend_30d / r.video_views_30d, 4) END,
    r.last_synced_at, r.linked_song_id, r.linked_event_id,
    (SELECT ref_currency FROM ref), r.spend_7d_ref, r.spend_30d_ref, r.fx_missing_days,
    r.data_source, r.last_recorded_at, r.link_kind, r.market_country
  FROM allrows r
  WHERE p_country IS NULL OR upper(coalesce(r.market_country,'?')) = upper(p_country)
  ORDER BY r.spend_30d DESC, r.start_date DESC NULLS LAST
$function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_connections(p_artist_id uuid)
 RETURNS TABLE(id uuid, platform text, status text, external_business_id text, external_business_name text, selected_ad_account_id text, selected_ad_account_name text, selected_ad_account_currency text, available_ad_accounts jsonb, connected_at timestamp with time zone, disconnected_at timestamp with time zone, last_error text, expires_at timestamp with time zone, last_synced_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  SELECT c.id, c.platform, c.status, c.external_business_id, c.external_business_name,
         c.selected_ad_account_id, c.selected_ad_account_name, c.selected_ad_account_currency,
         c.available_ad_accounts, c.connected_at, c.disconnected_at, c.last_error, c.expires_at,
         greatest(
           (SELECT max(g.last_synced_at)  FROM crm.google_campaign g                  WHERE g.connection_id  = c.id),
           (SELECT max(gi.last_synced_at) FROM crm.google_campaign_insights_daily gi   WHERE gi.connection_id = c.id),
           (SELECT max(ms.last_synced_at) FROM crm.meta_campaign_snapshot ms           WHERE ms.connection_id = c.id),
           (SELECT max(mi.last_synced_at) FROM crm.meta_campaign_insights_daily mi     WHERE mi.connection_id = c.id),
           (SELECT max(ma.last_synced_at) FROM crm.meta_ad_snapshot ma                 WHERE ma.connection_id = c.id)
         ) AS last_synced_at
    FROM crm.ad_platform_connections c
    JOIN public.artists a ON a.id = c.artist_id
   WHERE c.artist_id = p_artist_id
     AND c.connection_scope = 'artist'
     AND public.artist_access_ok(a.id,'read','traffic')
   ORDER BY c.platform;
$function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_creatives(p_artist_id uuid, p_connection_id uuid DEFAULT NULL::uuid, p_platform text DEFAULT 'meta'::text)
 RETURNS TABLE(connection_id uuid, creative_id text, nome text, formato text, thumbnail_url text, permalink text, campanha_nome text, anuncio_nome text, estado text, gasto_30d_cents bigint, impressoes_30d bigint, cliques_30d bigint, thruplays_30d bigint, ultimo_uso timestamp with time zone, importado boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_access_check(p_artist_id,'read','traffic');

  IF p_platform = 'tiktok' THEN
    RETURN QUERY
    SELECT c.id, ac.external_id, coalesce(ac.title, ac.caption_excerpt), 'video'::text,
           ac.thumbnail_url, ac.permalink, NULL::text, NULL::text, NULL::text,
           NULL::bigint, NULL::bigint, NULL::bigint, NULL::bigint, ac.published_at,
           EXISTS (SELECT 1 FROM crm.meta_creatives mc
                    WHERE mc.company_id = v_company AND mc.analysis_jsonb->>'external_ref' = ac.external_id)
    FROM public.artist_content ac
    LEFT JOIN crm.ad_platform_connections c
           ON c.connection_scope = 'artist' AND c.artist_id = p_artist_id
          AND c.company_id = v_company AND c.platform = 'tiktok'
          AND (p_connection_id IS NULL OR c.id = p_connection_id)
    WHERE ac.artist_id = p_artist_id AND ac.company_id = v_company
      AND ac.platform = 'tiktok' AND ac.content_type = 'video' AND ac.external_id IS NOT NULL
    ORDER BY ac.published_at DESC NULLS LAST;
    RETURN;
  END IF;

  IF p_platform IS DISTINCT FROM 'meta' THEN
    RAISE EXCEPTION 'plataforma não suportada' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH conns AS (
    SELECT c.id FROM crm.ad_platform_connections c
     WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id
       AND c.company_id = v_company AND c.platform = 'meta'
       AND (p_connection_id IS NULL OR c.id = p_connection_id)
  ),
  ads AS (
    SELECT s.connection_id, s.meta_creative_id, s.external_ad_id, s.name AS ad_name,
           cs.name AS campaign_name, s.effective_status, s.created_time,
           s.raw->'creative' AS cre,
           row_number() OVER (PARTITION BY s.meta_creative_id ORDER BY s.created_time DESC NULLS LAST) AS rn,
           max(s.created_time) OVER (PARTITION BY s.meta_creative_id) AS ultimo_uso
      FROM crm.meta_ad_snapshot s
      JOIN conns ON conns.id = s.connection_id
      LEFT JOIN crm.meta_campaign_snapshot cs
             ON cs.external_campaign_id = s.external_campaign_id AND cs.connection_id = s.connection_id
     WHERE s.meta_creative_id IS NOT NULL
  ),
  perf AS (
    SELECT a.meta_creative_id, sum(i.spend_cents)::bigint AS gasto, sum(i.impressions)::bigint AS imp,
           sum(i.clicks)::bigint AS clk, sum(i.video_thruplays)::bigint AS thru
      FROM crm.meta_ad_insights_daily i JOIN ads a ON a.external_ad_id = i.external_ad_id
     WHERE i.date_start >= current_date - 30 GROUP BY 1
  )
  SELECT a.connection_id, a.meta_creative_id, coalesce(a.cre->>'name', a.ad_name),
         CASE WHEN a.cre->>'video_id' IS NOT NULL THEN 'video'
              WHEN a.cre->>'image_url' IS NOT NULL THEN 'imagem'
              ELSE coalesce(lower(a.cre->>'object_type'), 'outro') END,
         a.cre->>'thumbnail_url', a.cre->>'instagram_permalink_url',
         a.campaign_name, a.ad_name, a.effective_status,
         p.gasto, p.imp, p.clk, p.thru, a.ultimo_uso,
         EXISTS (SELECT 1 FROM crm.meta_creatives mc WHERE mc.meta_creative_id = a.meta_creative_id)
    FROM ads a LEFT JOIN perf p ON p.meta_creative_id = a.meta_creative_id
   WHERE a.rn = 1
   ORDER BY p.gasto DESC NULLS LAST, a.ultimo_uso DESC NULLS LAST;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_daily(p_artist_id uuid, p_days integer DEFAULT 90)
 RETURNS TABLE(platform text, connection_id uuid, account_id text, campaign_id text, campaign_name text, day date, spend numeric, currency text, impressions bigint, clicks bigint, video_views bigint, results numeric, ref_currency text, spend_ref numeric, fx_missing_days integer, data_source text, last_recorded_at timestamp with time zone, video_views_6s bigint, likes bigint, follows bigint, view_content bigint, button_click bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  WITH guard AS (SELECT public.artist_access_check(p_artist_id,'read','traffic') AS company_id),
  ref AS (
    SELECT coalesce(a.reporting_currency, co.currency) AS ref_currency
    FROM public.artists a LEFT JOIN public.companies co ON co.id = a.company_id
    WHERE a.id = p_artist_id
  ),
  conns AS (
    SELECT c.id, c.platform, c.selected_ad_account_id, c.selected_ad_account_currency
    FROM crm.ad_platform_connections c, guard g
    WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id AND c.company_id = g.company_id
  ),
  t_lv AS (
    SELECT i.*, bool_or(i.level = 'campaign') OVER (PARTITION BY i.connection_id, i.external_campaign_id, i.date_start) AS has_c
    FROM crm.tiktok_insights_daily_carreira i
    JOIN conns c ON c.id = i.connection_id AND c.platform = 'tiktok'
    WHERE i.level IN ('campaign','adgroup')
      AND i.date_start >= current_date - (greatest(coalesce(p_days,90),1) - 1)
  ),
  t_day AS (
    SELECT i.connection_id, i.external_campaign_id, i.date_start,
      sum(i.spend_cents) AS spend_cents, sum(i.impressions) AS impressions, sum(i.clicks) AS clicks,
      sum(coalesce(i.video_views_6s, i.video_views_2s, 0)) AS video_views,
      -- D-ERP144 adenda: Resultados TikTok = visualizações de 6 s do dia
      sum(coalesce(i.video_views_6s,0)) AS results_6s,
      sum(i.video_views_6s)::bigint AS v6s, sum(i.likes)::bigint AS likes, sum(i.follows)::bigint AS follows,
      sum(i.view_content)::bigint AS view_content, sum(i.button_click)::bigint AS button_click,
      (array_agg(i.currency) FILTER (WHERE i.currency IS NOT NULL))[1] AS currency,
      CASE WHEN bool_and(i.source = 'api') THEN 'api' WHEN bool_and(i.source = 'manual') THEN 'manual' ELSE 'mixed' END AS data_source,
      max(i.recorded_at) AS recorded_at
    FROM t_lv i
    WHERE (i.has_c AND i.level = 'campaign') OR (NOT i.has_c AND i.level = 'adgroup')
    GROUP BY 1,2,3
  ),
  s AS (
    SELECT 'google'::text AS platform, c.id AS connection_id,
      c.selected_ad_account_id AS account_id,
      i.external_campaign_id AS campaign_id, i.campaign_name AS campaign_name,
      i.date_start AS day, i.spend_cents/100.0 AS spend,
      coalesce(i.impressions,0)::bigint AS impressions, coalesce(i.clicks,0)::bigint AS clicks,
      CASE WHEN coalesce(i.video_metrics->>'video_views', i.raw->>'video_views') ~ '^[0-9]+$' THEN (coalesce(i.video_metrics->>'video_views', i.raw->>'video_views'))::bigint ELSE 0 END AS video_views,
      coalesce(i.conversions,0) AS results,
      coalesce(i.currency, c.selected_ad_account_currency) AS row_currency,
      'api'::text AS data_source, NULL::timestamptz AS last_recorded_at,
      NULL::bigint AS video_views_6s, NULL::bigint AS likes, NULL::bigint AS follows, NULL::bigint AS view_content, NULL::bigint AS button_click
    FROM crm.google_campaign_insights_daily i
    JOIN conns c ON c.id = i.connection_id AND c.platform = 'google'
    WHERE i.date_start >= current_date - (greatest(coalesce(p_days,90),1) - 1)
    UNION ALL
    SELECT 'meta'::text, c.id, c.selected_ad_account_id,
      i.external_campaign_id, i.campaign_name, i.date_start, i.spend_cents/100.0,
      coalesce(i.impressions,0)::bigint, coalesce(i.clicks,0)::bigint,
      coalesce(i.video_thruplays, i.video_3s_views, i.video_plays, 0)::bigint,
      (coalesce(i.purchases_count,0) + coalesce(i.leads_count,0))::numeric,
      coalesce(i.currency, c.selected_ad_account_currency),
      'api'::text, NULL::timestamptz,
      NULL::bigint, NULL::bigint, NULL::bigint, NULL::bigint, NULL::bigint
    FROM crm.meta_campaign_insights_daily i
    JOIN conns c ON c.id = i.connection_id AND c.platform = 'meta'
    WHERE i.date_start >= current_date - (greatest(coalesce(p_days,90),1) - 1)
    UNION ALL
    SELECT 'tiktok'::text, c.id, c.selected_ad_account_id,
      d.external_campaign_id, tc.name, d.date_start, d.spend_cents/100.0,
      coalesce(d.impressions,0)::bigint, coalesce(d.clicks,0)::bigint,
      coalesce(d.video_views,0)::bigint, coalesce(d.results_6s,0)::numeric,
      coalesce(d.currency, c.selected_ad_account_currency),
      d.data_source, d.recorded_at,
      d.v6s, d.likes, d.follows, d.view_content, d.button_click
    FROM t_day d
    JOIN conns c ON c.id = d.connection_id
    LEFT JOIN crm.tiktok_campaign_carreira tc ON tc.connection_id = d.connection_id AND tc.external_campaign_id = d.external_campaign_id
  ),
  conv AS (
    SELECT s.*, r.ref_currency,
      public.fx_convert(s.spend, s.row_currency, r.ref_currency, s.day) AS spend_ref
    FROM s CROSS JOIN ref r
  )
  SELECT c.platform, c.connection_id, c.account_id, c.campaign_id, c.campaign_name, c.day,
    c.spend, c.row_currency, c.impressions, c.clicks, c.video_views, c.results,
    c.ref_currency, c.spend_ref,
    (CASE WHEN c.spend > 0 AND c.spend_ref IS NULL THEN 1 ELSE 0 END)::integer,
    c.data_source, c.last_recorded_at,
    c.video_views_6s, c.likes, c.follows, c.view_content, c.button_click
  FROM conv c ORDER BY c.day, c.platform, c.campaign_id
$function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_investment_report(p_artist_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm', 'pg_catalog'
AS $function$
DECLARE
 v_company uuid; v_ref text; v_from date; v_to date:=coalesce(p_to,current_date); v_start date;
 v_report jsonb; v_daily jsonb; v_campaigns jsonb; v_active jsonb; v_projection jsonb; v_missing jsonb; v_totals jsonb; v_fx jsonb;
 v_kpis jsonb:='[]'; v_series jsonb:='[]'; v_marks jsonb; spec record; v_base record; v_current record; pts jsonb;
 v_spend numeric; v_arrivals numeric; v_traffic numeric; v_streams numeric; v_projected numeric; v_month numeric;
BEGIN
 v_company:=public.artist_access_check(p_artist_id,'read','financial');
 SELECT coalesce(a.reporting_currency,c.currency,'EUR') INTO v_ref FROM public.artists a LEFT JOIN public.companies c ON c.id=a.company_id WHERE a.id=p_artist_id;
 -- Campaign schedule and active budget legs. Never treat lifetime budgets as daily budgets.
 WITH conns AS (SELECT * FROM crm.ad_platform_connections WHERE artist_id=p_artist_id AND company_id=v_company AND connection_scope='artist'),
 legs AS (
 SELECT 'meta'::text platform,c.selected_ad_account_id account,c.selected_ad_account_currency currency,s.external_campaign_id cid,s.name nome,s.objective objective,
  coalesce(s.effective_status,s.status) status,
  coalesce(s.start_time,(SELECT min(start_time) FROM crm.meta_adset_snapshot WHERE connection_id=s.connection_id AND external_campaign_id=s.external_campaign_id))::date starts,
  coalesce(s.stop_time,(SELECT max(end_time) FROM crm.meta_adset_snapshot WHERE connection_id=s.connection_id AND external_campaign_id=s.external_campaign_id))::date ends,
  s.market_country country,s.raw,
  coalesce((SELECT jsonb_agg(jsonb_build_object('budget',x.daily_budget_cents/100.0,'start',x.start_time::date,'end',x.end_time::date,'state',coalesce(x.effective_status,x.status),'geo',x.targeting->'geo_locations')) FROM crm.meta_adset_snapshot x WHERE x.connection_id=s.connection_id AND x.external_campaign_id=s.external_campaign_id),'[]'::jsonb) parts,
  s.daily_budget_cents/100.0 campaign_budget
 FROM crm.meta_campaign_snapshot s JOIN conns c ON c.id=s.connection_id
 UNION ALL
 SELECT 'google',c.selected_ad_account_id,c.selected_ad_account_currency,g.external_campaign_id,g.name,g.advertising_channel_type,g.status,g.start_date,g.end_date,g.market_country,g.raw,
  jsonb_build_array(jsonb_build_object('budget',g.budget_amount_micros/1000000.0,'start',g.start_date,'end',g.end_date,'state',g.status,'geo',(SELECT jsonb_agg(x->'localizacao') FROM jsonb_array_elements(coalesce(g.settings->'criterios','[]')) x WHERE x->>'tipo'='LOCATION' AND coalesce((x->>'negativo')::boolean,false)=false))),coalesce(g.budget_amount_micros/1000000.0,CASE WHEN g.end_date IS NOT NULL AND g.end_date>=current_date AND (g.raw->'campaignBudget'->>'totalAmountMicros') IS NOT NULL THEN round(greatest(0,(g.raw->'campaignBudget'->>'totalAmountMicros')::numeric/1000000.0-coalesce((SELECT sum(gi.spend_cents)/100.0 FROM crm.google_campaign_insights_daily gi WHERE gi.connection_id=g.connection_id AND gi.external_campaign_id=g.external_campaign_id AND gi.date_start<=current_date),0))/greatest(1,g.end_date-current_date),2) END)
 FROM crm.google_campaign g JOIN conns c ON c.id=g.connection_id
 UNION ALL
 SELECT 'tiktok',c.selected_ad_account_id,coalesce(t.currency,c.selected_ad_account_currency),t.external_campaign_id,t.name,t.objective,t.status,
  coalesce(substring(t.raw->>'start_time' from '^\d{4}-\d{2}-\d{2}'),substring(t.raw->>'create_time' from '^\d{4}-\d{2}-\d{2}'))::date,
  substring(t.raw->>'end_time' from '^\d{4}-\d{2}-\d{2}')::date,t.market_country,t.raw,
  coalesce((SELECT jsonb_agg(jsonb_build_object('budget',CASE WHEN coalesce(x.raw->>'budget_mode','BUDGET_MODE_DAY') IN ('BUDGET_MODE_DAY','BUDGET_MODE_DYNAMIC_DAILY_BUDGET') THEN x.budget_cents/100.0 END,
    'start',substring(coalesce(x.raw->>'schedule_start_time',x.raw->>'start_time') from '^\d{4}-\d{2}-\d{2}'),
    'end',substring(coalesce(x.raw->>'schedule_end_time',x.raw->>'end_time') from '^\d{4}-\d{2}-\d{2}'),'state',x.status,'geo',coalesce(x.raw->'location_ids',x.raw->'geo_locations')))
   FROM crm.tiktok_adgroup x WHERE x.connection_id=t.connection_id AND x.external_campaign_id=t.external_campaign_id),'[]'::jsonb),
  CASE WHEN t.raw->>'budget_mode' IN ('BUDGET_MODE_DAY','BUDGET_MODE_DYNAMIC_DAILY_BUDGET') THEN nullif(t.budget_cents,0)/100.0 END
 FROM crm.tiktok_campaign_carreira t JOIN conns c ON c.id=t.connection_id
 ), normalized AS (
 SELECT l.*,coalesce(l.starts,substring(l.nome from '(\d{4}-\d{2}-\d{2})')::date) start_date,
 CASE WHEN coalesce(l.ends,(SELECT max((p->>'end')::date) FROM jsonb_array_elements(l.parts) p))>current_date+365 THEN NULL ELSE coalesce(l.ends,(SELECT max((p->>'end')::date) FROM jsonb_array_elements(l.parts) p)) END end_date,
 coalesce(nullif(l.campaign_budget,0),(SELECT CASE WHEN bool_or(p->>'budget' IS NULL) THEN NULL ELSE sum((p->>'budget')::numeric) END FROM jsonb_array_elements(l.parts) p WHERE upper(p->>'state') IN ('ACTIVE','ENABLED','ENABLE','CAMPAIGN_STATUS_ENABLE') AND coalesce((p->>'start')::date,current_date)<=current_date AND coalesce((p->>'end')::date,current_date)>=current_date)) daily_budget
 FROM legs l)
 SELECT coalesce(jsonb_agg(to_jsonb(n)),'[]') INTO v_campaigns FROM normalized n;
 SELECT min((c->>'start_date')::date) INTO v_start FROM jsonb_array_elements(v_campaigns) c WHERE c->>'nome' ~* '^\s*\[mp\]';
 -- If schedule is absent, the first actual [MP] insight is the honest management start.
 IF v_start IS NULL THEN
  SELECT min(d) INTO v_start FROM (
   SELECT i.date_start d FROM crm.meta_campaign_insights_daily i JOIN crm.meta_campaign_snapshot s USING(connection_id,external_campaign_id) JOIN crm.ad_platform_connections c ON c.id=i.connection_id WHERE c.artist_id=p_artist_id AND c.company_id=v_company AND s.name ~* '^\s*\[mp\]'
   UNION ALL SELECT i.date_start FROM crm.google_campaign_insights_daily i JOIN crm.google_campaign s USING(connection_id,external_campaign_id) JOIN crm.ad_platform_connections c ON c.id=i.connection_id WHERE c.artist_id=p_artist_id AND c.company_id=v_company AND s.name ~* '^\s*\[mp\]'
   UNION ALL SELECT i.date_start FROM crm.tiktok_insights_daily_carreira i JOIN crm.tiktok_campaign_carreira s USING(connection_id,external_campaign_id) JOIN crm.ad_platform_connections c ON c.id=i.connection_id WHERE c.artist_id=p_artist_id AND c.company_id=v_company AND s.name ~* '^\s*\[mp\]') z;
 END IF;
 v_from:=coalesce(p_from,v_start,v_to);
 IF v_from>v_to THEN RAISE EXCEPTION 'período inválido' USING ERRCODE='22023'; END IF;
 v_report:=public._artist_ads_investment_source(p_artist_id,v_from,v_to);
 -- Totals, traffic objective classification and arrivals come from D-ERP185, not a new interpretation.
 SELECT coalesce(sum((c->>'gasto_ref')::numeric),0) INTO v_spend FROM jsonb_array_elements(v_report->'plataformas') p,jsonb_array_elements(p->'campanhas') c;
 IF (v_report->'totais'->>'fx_missing_days')::integer>0 THEN v_spend:=NULL; END IF;
 SELECT coalesce(sum((p->>'gasto_trafego')::numeric),0),coalesce(sum((p->>'chegadas')::numeric),0) INTO v_traffic,v_arrivals FROM jsonb_array_elements(v_report->'plataformas') p;
 SELECT jsonb_agg(jsonb_build_object('plataforma',p->>'platform','gasto_ref',(SELECT sum((c->>'gasto_ref')::numeric) FROM jsonb_array_elements(p->'campanhas') c),
 'pct',CASE WHEN v_spend>0 THEN round((SELECT sum((c->>'gasto_ref')::numeric) FROM jsonb_array_elements(p->'campanhas') c)/v_spend*100,2) END,'campanhas',jsonb_array_length(p->'campanhas'))) INTO v_totals FROM jsonb_array_elements(v_report->'plataformas') p;

 
 SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'plataforma',plat,'conta',acc,'moeda',cur,'gasto',sp,'gasto_ref',gr,'gasto_trafego_ref',gt) ORDER BY dia,plat,acc,cur),'[]') INTO v_daily FROM
 (SELECT j->>'dia' dia,j->>'plataforma' plat,j->>'conta' acc,j->>'moeda' cur,sum((j->>'gasto')::numeric) sp,
 CASE WHEN bool_or(j->>'gasto_ref' IS NULL AND (j->>'gasto')::numeric>0) THEN NULL ELSE sum((j->>'gasto_ref')::numeric) END gr,sum((j->>'gasto_trafego_ref')::numeric) gt
 FROM jsonb_array_elements(v_report->'daily') j GROUP BY 1,2,3,4) z;

 IF date_trunc('month',current_date)::date>=v_from AND current_date<=v_to THEN
 SELECT CASE WHEN bool_or(j->>'gasto_ref' IS NULL AND (j->>'gasto')::numeric>0) THEN NULL ELSE coalesce(round(sum((j->>'gasto_ref')::numeric),2),0) END INTO v_month FROM jsonb_array_elements(v_daily) j WHERE (j->>'dia')::date BETWEEN date_trunc('month',current_date)::date AND current_date;
 ELSE
 DECLARE month_report jsonb; BEGIN month_report:=public._artist_ads_investment_source(p_artist_id,date_trunc('month',current_date)::date,current_date);
 SELECT CASE WHEN bool_or(j->>'gasto_ref' IS NULL AND (j->>'gasto')::numeric>0) THEN NULL ELSE coalesce(round(sum((j->>'gasto_ref')::numeric),2),0) END INTO v_month FROM jsonb_array_elements(month_report->'daily') j; END;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('moeda',currency,'moeda_ref',v_ref,'fonte','BCE','taxa',public.fx_convert(1,currency,v_ref,d),'data',d) ORDER BY d,currency),'[]') INTO v_fx
 FROM (SELECT DISTINCT j->>'moeda' currency,(j->>'dia')::date d FROM jsonb_array_elements(v_daily) j WHERE j->>'moeda'<>v_ref) f;
 SELECT coalesce(jsonb_agg(jsonb_build_object('plataforma',c->>'platform','conta',c->>'account','campaign_id',c->>'cid','campanha',c->>'nome','objetivo',c->>'objective',
  'segmentacao',jsonb_build_object('pais',c->>'country','regioes',(SELECT jsonb_agg(p->'geo') FROM jsonb_array_elements(c->'parts') p WHERE p->'geo' IS NOT NULL)),
  'orcamento_dia',(c->>'daily_budget')::numeric,'orcamento_tipo',CASE WHEN c->>'daily_budget' IS NULL THEN NULL WHEN c->>'platform'='google' AND coalesce(c->'raw'->'campaignBudget'->>'period','DAILY')<>'DAILY' THEN 'derivado' ELSE 'diario' END,'moeda',c->>'currency','termina',c->'end_date','estado',c->>'status',
  'dias_projecao',greatest(0,least(coalesce((c->>'end_date')::date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date),(date_trunc('month',current_date)+interval '1 month - 1 day')::date)-current_date))), '[]') INTO v_active
 FROM jsonb_array_elements(v_campaigns) c WHERE upper(c->>'status') IN ('ACTIVE','ENABLED','ENABLE','CAMPAIGN_STATUS_ENABLE')
 AND coalesce((c->>'start_date')::date,current_date)<=current_date AND coalesce((c->>'end_date')::date,current_date)>=current_date
 AND (jsonb_array_length(c->'parts')=0 OR EXISTS (SELECT 1 FROM jsonb_array_elements(c->'parts') p WHERE upper(p->>'state') IN ('ACTIVE','ENABLED','ENABLE','CAMPAIGN_STATUS_ENABLE') AND coalesce((p->>'start')::date,current_date)<=current_date AND coalesce((p->>'end')::date,current_date)>=current_date));
 SELECT coalesce(jsonb_agg(jsonb_build_object('plataforma',platform,'em_vigor_ref',amount,'orcamento_em_falta',missing)),'[]'),
 coalesce(round(sum(amount),2),0) INTO v_projection,v_projected
 FROM (SELECT c->>'plataforma' platform,round(sum((SELECT CASE WHEN (s->>'campaign_budget')::numeric>0 THEN public.fx_convert((c->>'orcamento_dia')::numeric,c->>'moeda',v_ref,current_date)*(c->>'dias_projecao')::integer
 ELSE (SELECT sum(public.fx_convert((p->>'budget')::numeric,c->>'moeda',v_ref,current_date)*greatest(0,least(coalesce(CASE WHEN (p->>'end')::date>current_date+365 THEN NULL ELSE (p->>'end')::date END,(s->>'end_date')::date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date),(date_trunc('month',current_date)+interval '1 month - 1 day')::date)-current_date)) FROM jsonb_array_elements(s->'parts') p WHERE upper(p->>'state') IN ('ACTIVE','ENABLED','ENABLE','CAMPAIGN_STATUS_ENABLE') AND coalesce((p->>'start')::date,current_date)<=current_date AND coalesce((p->>'end')::date,current_date)>=current_date) END FROM jsonb_array_elements(v_campaigns) s WHERE s->>'platform'=c->>'plataforma' AND s->>'account'=c->>'conta' AND s->>'cid'=c->>'campaign_id' LIMIT 1)) FILTER (WHERE c->>'orcamento_dia' IS NOT NULL AND public.fx_convert((c->>'orcamento_dia')::numeric,c->>'moeda',v_ref,current_date) IS NOT NULL),2) amount,
 bool_or(c->>'orcamento_dia' IS NULL OR public.fx_convert((c->>'orcamento_dia')::numeric,c->>'moeda',v_ref,current_date) IS NULL) missing FROM jsonb_array_elements(v_active) c GROUP BY 1) q;
 SELECT coalesce(jsonb_agg(jsonb_build_object('plataforma',c->>'plataforma','campanha',c->>'campanha','motivo',CASE WHEN c->>'orcamento_dia' IS NULL THEN 'orcamento_desconhecido' ELSE 'cambio_indisponivel' END)),'[]') INTO v_missing
 FROM jsonb_array_elements(v_active) c WHERE c->>'orcamento_dia' IS NULL OR public.fx_convert((c->>'orcamento_dia')::numeric,c->>'moeda',v_ref,current_date) IS NULL;
 -- Seven series. Flow metrics are per day; social metrics are measured stocks, never invented zeroes.
 FOR spec IN SELECT * FROM (VALUES
 ('gasto_total','Gasto total',v_ref,'ads'),('chegadas_spotify','Chegadas ao Spotify','chegadas','song_link_events'),('custo_por_chegada','Custo por chegada',v_ref||'/chegada','D-ERP185'),
 ('ouvintes_mensais_spotify','Ouvintes mensais Spotify','ouvintes','artist_metrics_daily'),('streams_periodo','Streams das músicas no período','streams','artist_song_metrics_daily'),
 ('seguidores_tiktok','Seguidores TikTok','seguidores','artist_metrics_daily'),('seguidores_instagram','Seguidores Instagram','seguidores','artist_metrics_daily')) x(chave,rotulo,unit,source)
 LOOP
  v_base:=NULL;v_current:=NULL;pts:='[]';
  IF spec.chave IN ('ouvintes_mensais_spotify','seguidores_tiktok','seguidores_instagram') THEN
   WITH m AS (SELECT DISTINCT ON(metric_date) metric_date d,value v,source FROM public.artist_metrics_daily WHERE artist_id=p_artist_id AND platform=CASE spec.chave WHEN 'ouvintes_mensais_spotify' THEN 'spotify' WHEN 'seguidores_tiktok' THEN 'tiktok' ELSE 'instagram' END AND metric=CASE WHEN spec.chave='ouvintes_mensais_spotify' THEN 'monthly_listeners' ELSE 'followers' END AND metric_date<=v_to ORDER BY metric_date,CASE source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END,captured_at DESC NULLS LAST)
   SELECT coalesce(jsonb_agg(jsonb_build_object('d',d,'v',v) ORDER BY d) FILTER(WHERE d BETWEEN v_from AND v_to),'[]') INTO pts FROM m;
   SELECT (p->>'d')::date d,(p->>'v')::numeric v INTO v_base FROM jsonb_array_elements(pts) p ORDER BY abs((p->>'d')::date-v_from) LIMIT 1;
   SELECT (p->>'d')::date d,(p->>'v')::numeric v INTO v_current FROM jsonb_array_elements(pts) p ORDER BY p->>'d' DESC LIMIT 1;
  ELSIF spec.chave='streams_periodo' THEN
   WITH m AS (SELECT DISTINCT ON(song_id,metric_date) song_id,metric_date d,value v FROM public.artist_song_metrics_daily WHERE artist_id=p_artist_id AND metric='s4a_streams_day' AND metric_date BETWEEN v_from AND v_to ORDER BY song_id,metric_date,(source='s4a_api') DESC,captured_at DESC)
   SELECT coalesce(jsonb_agg(jsonb_build_object('d',d,'v',v) ORDER BY d),'[]'),sum(v) INTO pts,v_streams FROM (SELECT d,sum(v) v FROM m GROUP BY d) x;
   SELECT v_from d,0::numeric v INTO v_base; SELECT max((p->>'d')::date) d,v_streams v INTO v_current FROM jsonb_array_elements(pts) p;
  ELSE
   IF spec.chave='gasto_total' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('d',d,'v',v) ORDER BY d),'[]') INTO pts FROM (SELECT j->>'dia' d,sum((j->>'gasto_ref')::numeric) v FROM jsonb_array_elements(v_daily) j GROUP BY 1) z;
    SELECT v_from d,0::numeric v INTO v_base;SELECT v_to d,v_spend v INTO v_current;
   ELSE
    -- Same effective-channel mapping as D-ERP185; test events excluded. No click fallback.

    WITH arr AS (SELECT (j->>'d')::date d,(j->>'v')::numeric n FROM jsonb_array_elements(v_report->'arrivals_daily') j),
    tr AS (SELECT (j->>'dia')::date d,sum((j->>'gasto_trafego_ref')::numeric) spend FROM jsonb_array_elements(v_daily) j GROUP BY 1)
    SELECT coalesce(jsonb_agg(jsonb_build_object('d',d,'v',CASE WHEN spec.chave='chegadas_spotify' THEN n ELSE CASE WHEN n>0 THEN round(spend/n,4) END END) ORDER BY d),'[]') INTO pts FROM arr LEFT JOIN tr USING(d);
    SELECT v_from d,CASE WHEN spec.chave='chegadas_spotify' THEN 0::numeric ELSE NULL::numeric END v INTO v_base;
    SELECT v_to d,CASE WHEN spec.chave='chegadas_spotify' THEN v_arrivals ELSE CASE WHEN v_arrivals>0 THEN round(v_traffic/v_arrivals,4) END END v INTO v_current;
   END IF;
  END IF;
  v_kpis:=v_kpis||jsonb_build_object('chave',spec.chave,'valor_inicial',v_base.v,'valor_atual',v_current.v,'delta',v_current.v-v_base.v,'unidade',spec.unit,'fonte',spec.source,'as_of',v_current.d,'base_data',v_base.d);
  v_series:=v_series||jsonb_build_object('chave',spec.chave,'rotulo',spec.rotulo,'pontos',pts,'fonte',spec.source,'as_of',v_current.d);
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('dia',d,'texto',txt) ORDER BY d,txt),'[]') INTO v_marks FROM (
 SELECT (c->>'start_date')::date d,'Início: '||(c->>'nome') txt FROM jsonb_array_elements(v_campaigns) c WHERE c->>'nome' ~* '^\s*\[mp\]' AND (c->>'start_date')::date BETWEEN v_from AND v_to
 UNION ALL SELECT (c->>'end_date')::date,'Fim: '||(c->>'nome') FROM jsonb_array_elements(v_campaigns) c WHERE c->>'nome' ~* '^\s*\[mp\]' AND (c->>'end_date')::date BETWEEN v_from AND v_to
 UNION ALL SELECT (j->>'d')::date,'Investimento diário acima de 2× a média do período' FROM jsonb_array_elements(v_series->0->'pontos') j WHERE (j->>'v')::numeric>2*v_spend/(v_to-v_from+1)) z;
 RETURN jsonb_build_object('artista_id',p_artist_id,'ref_currency',v_ref,'periodo',jsonb_build_object('de',v_from,'ate',v_to,'inicio_gestao',v_start,'dia_parcial',v_to>=current_date),
 'kpis',v_kpis,'gasto_diario',v_daily,'cambio',v_fx,'totais_plataforma',coalesce(v_totals,'[]'),'marcos',v_marks,'series',v_series,'campanhas_no_ar',v_active,
 'ritmo_diario_ref',v_spend/(v_to-v_from+1),'projecao',v_projection,'total_projetado_ref',coalesce(v_projected,0),'total_mes_ref',round(coalesce(v_month,0)+coalesce(v_projected,0),2),'parcial',jsonb_array_length(coalesce(v_missing,'[]'))>0 OR v_month IS NULL,'em_falta',coalesce(v_missing,'[]'),
 'fontes',jsonb_build_array('artist_ads_period_report: campanhas.gasto_ref, gasto_trafego e chegadas por canal (D-ERP185)','Insights diários: Meta, Google e TikTok; precedência campaign > adgroup','artist_metrics_daily: aggregator > platform_api > public_page','artist_song_metrics_daily: s4a_streams_day, soma diária por música','fx_convert: BCE do próprio dia; câmbio ausente = null; projeção exclui hoje','Orçamentos diários activos; lifetime não é orçamento diário'),
 'lacunas',jsonb_build_array('Chegadas ao Spotify são chegadas a smart links do artista nos canais pagos; não provam abertura nem stream no Spotify.','Streams: soma S4A diária das músicas do artista; sem medição retorna null.'));
END $function$
;

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
  IF NOT public.artist_access_ok((SELECT s.artist_id FROM public.artist_songs s WHERE s.id = p_song_id),'traffic_write',NULL) THEN
    RAISE EXCEPTION 'sem permissão para ligar campanha a música' USING ERRCODE = '42501';
  END IF;
  IF p_platform = 'google' THEN
    UPDATE crm.google_campaign SET linked_song_id = p_song_id, linked_song_locked = true,
      link_kind = 'song', link_kind_locked = true
    WHERE external_campaign_id = p_campaign_id AND company_id = v_company;
  ELSE
    UPDATE crm.meta_campaign_snapshot SET linked_song_id = p_song_id, linked_song_locked = true,
      link_kind = 'song', link_kind_locked = true
    WHERE external_campaign_id = p_campaign_id AND company_id = v_company;
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_period_report(p_artist_id uuid, p_from date, p_to date, p_country text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE
  v_company uuid; v_ref text; v_nome text; v_out jsonb; v_plat jsonb; v_mus jsonb; v_lac jsonb; v_tot jsonb;
BEGIN
  v_company := public.artist_access_check(p_artist_id,'read','traffic');
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'período inválido' USING ERRCODE='22023'; END IF;
  IF p_to - p_from > 366 THEN RAISE EXCEPTION 'período máximo 366 dias' USING ERRCODE='22023'; END IF;

  SELECT a.name, coalesce(a.reporting_currency, co.currency, 'EUR') INTO v_nome, v_ref
  FROM public.artists a LEFT JOIN public.companies co ON co.id = a.company_id WHERE a.id = p_artist_id;

  WITH conns AS (
    SELECT c.id, c.platform, c.selected_ad_account_id, c.selected_ad_account_name, c.selected_ad_account_currency
    FROM crm.ad_platform_connections c
    WHERE c.connection_scope='artist' AND c.artist_id=p_artist_id AND c.company_id=v_company
  ),
  cmc AS (
    SELECT 'meta'::text platform, s.connection_id, s.external_campaign_id cid, coalesce(s.market_country,'?') mc
      FROM crm.meta_campaign_snapshot s JOIN conns c ON c.id=s.connection_id
    UNION ALL SELECT 'google', g.connection_id, g.external_campaign_id, coalesce(g.market_country,'?')
      FROM crm.google_campaign g JOIN conns c ON c.id=g.connection_id
    UNION ALL SELECT 'tiktok', t.connection_id, t.external_campaign_id, coalesce(t.market_country,'?')
      FROM crm.tiktok_campaign_carreira t JOIN conns c ON c.id=t.connection_id
  ),
  conn_sync AS (
    SELECT c.id, greatest(
      CASE WHEN c.platform='meta' THEN (SELECT max(i.last_synced_at) FROM crm.meta_campaign_insights_daily i WHERE i.connection_id=c.id) END,
      CASE WHEN c.platform='meta' THEN (SELECT max(s.last_sync_at) FROM crm.meta_sync_state s
            WHERE s.connection_id=c.id AND s.level='insights_campaign'
              AND (s.last_error_at IS NULL OR s.last_error_at < s.last_sync_at)) END,
      CASE WHEN c.platform='google' THEN (SELECT max(i.last_synced_at) FROM crm.google_campaign_insights_daily i WHERE i.connection_id=c.id) END,
      CASE WHEN c.platform='tiktok' THEN (SELECT max(i.recorded_at) FROM crm.tiktok_insights_daily_carreira i WHERE i.connection_id=c.id AND i.source<>'manual') END
    ) ok_ate
    FROM conns c
  ),
  t_lv AS (
    SELECT i.*, bool_or(i.level='campaign') OVER (PARTITION BY i.connection_id, i.external_campaign_id, i.date_start) has_c
    FROM crm.tiktok_insights_daily_carreira i JOIN conns c ON c.id=i.connection_id AND c.platform='tiktok'
    WHERE i.level IN ('campaign','adgroup') AND i.date_start BETWEEN p_from AND p_to
  ),
  cd AS (
    SELECT 'meta'::text platform, i.connection_id, i.external_campaign_id cid, i.date_start dia,
      coalesce(i.currency,c.selected_ad_account_currency) currency, i.spend_cents/100.0 spend,
      i.impressions::numeric imp, i.clicks::numeric clk,
      i.video_3s_views::numeric m3s, i.video_thruplays::numeric mthru, i.video_p25_watched::numeric p25,
      i.video_p50_watched::numeric p50, i.video_p75_watched::numeric p75, i.video_p100_watched::numeric p100,
      NULL::numeric gviews, NULL::numeric t2s, NULL::numeric t6s, NULL::numeric likes, NULL::numeric follows,
      i.last_synced_at leitura, 'api'::text src,
      NULL::numeric sm6,
      CASE WHEN i.clicks IS NOT NULL THEN i.spend_cents/100.0 END smc,
      CASE WHEN i.impressions IS NOT NULL THEN i.spend_cents/100.0 END smi,
      lk.lc,
      CASE WHEN lk.lc IS NOT NULL THEN i.spend_cents/100.0 END sml
    FROM crm.meta_campaign_insights_daily i
    LEFT JOIN LATERAL (SELECT sum((a->>'value')::numeric) lc FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(coalesce(i.actions, i.raw->'actions'))='array' THEN coalesce(i.actions, i.raw->'actions') ELSE '[]'::jsonb END) a
        WHERE a->>'action_type'='link_click') lk ON true JOIN conns c ON c.id=i.connection_id AND c.platform='meta'
    WHERE i.date_start BETWEEN p_from AND p_to
    UNION ALL
    SELECT 'google', i.connection_id, i.external_campaign_id, i.date_start,
      coalesce(i.currency,c.selected_ad_account_currency), i.spend_cents/100.0, i.impressions, i.clicks,
      NULL,NULL,NULL,NULL,NULL,NULL,
      CASE WHEN coalesce(i.video_metrics->>'video_views', i.raw->>'video_views') ~ '^[0-9]+(\.0+)?$'
           THEN (coalesce(i.video_metrics->>'video_views', i.raw->>'video_views'))::numeric END,
      NULL,NULL,NULL,NULL, i.last_synced_at, 'api',
      NULL,
      CASE WHEN i.clicks IS NOT NULL THEN i.spend_cents/100.0 END,
      CASE WHEN i.impressions IS NOT NULL THEN i.spend_cents/100.0 END,
      NULL, NULL
    FROM crm.google_campaign_insights_daily i JOIN conns c ON c.id=i.connection_id AND c.platform='google'
    WHERE i.date_start BETWEEN p_from AND p_to
    UNION ALL
    SELECT 'tiktok', i.connection_id, i.external_campaign_id, i.date_start,
      coalesce(max(i.currency),max(c.selected_ad_account_currency)), sum(i.spend_cents)/100.0, sum(i.impressions), sum(i.clicks),
      NULL,NULL,NULL,NULL,NULL,NULL,NULL,
      sum(i.video_views_2s), sum(i.video_views_6s), sum(i.likes), sum(i.follows),
      max(i.recorded_at), CASE WHEN bool_and(i.source='manual') THEN 'manual' ELSE 'api' END,
      coalesce(sum(i.spend_cents) FILTER (WHERE i.video_views_6s IS NOT NULL),0)/100.0,
      coalesce(sum(i.spend_cents) FILTER (WHERE i.clicks IS NOT NULL),0)/100.0,
      coalesce(sum(i.spend_cents) FILTER (WHERE i.impressions IS NOT NULL),0)/100.0,
      NULL, NULL
    FROM t_lv i JOIN conns c ON c.id=i.connection_id
    WHERE (i.has_c AND i.level='campaign') OR (NOT i.has_c AND i.level='adgroup')
    GROUP BY i.connection_id, i.external_campaign_id, i.date_start
  ),
  cdr AS (
    SELECT z.*, (coalesce(z.spend,0)>0 AND z.spend_ref IS NULL) fx_miss FROM (
      SELECT cd.*, coalesce(k.mc,'?') ctry,
        CASE WHEN coalesce(cd.spend,0)=0 THEN 0 ELSE public.fx_convert(cd.spend, cd.currency, v_ref, cd.dia) END spend_ref
      FROM cd LEFT JOIN cmc k ON k.platform=cd.platform AND k.connection_id=cd.connection_id AND k.cid=cd.cid) z
    WHERE p_country IS NULL OR z.ctry = upper(p_country)
  ),
  ev AS MATERIALIZED (
    SELECT g.src, public.artist_ads_campaign_key(g.utm_campaign) k, g.n, g.v FROM (
      SELECT lower(coalesce(e.utm_source,'')) src, e.utm_campaign, count(*) n,
        count(DISTINCT (e.ip_hash, e.created_at::date)) v
      FROM public.song_link_events e
      WHERE e.artist_id=p_artist_id AND e.event='arrival'
        AND e.created_at >= p_from::timestamptz AND e.created_at < (p_to+1)::timestamptz
        AND (p_country IS NULL OR upper(e.country) = upper(p_country)) -- D-ERP185 adenda 3
      GROUP BY 1,2) g
  ),
  evk AS (SELECT * FROM ev WHERE length(k) >= 10),
  evc AS MATERIALIZED (
    SELECT public.song_link_event_canal(l.canal, e.utm_source, e.utm_medium, e.utm_campaign) canal,
      count(*) FILTER (WHERE (p_country IS NULL OR upper(e.country) = upper(p_country))) n,
      count(DISTINCT (e.ip_hash, e.created_at::date)) FILTER (WHERE (p_country IS NULL OR upper(e.country) = upper(p_country))) v,
      count(*) FILTER (WHERE e.country IS NULL) sp -- D-ERP185 adenda 3: sem país
    FROM public.song_link_events e LEFT JOIN public.song_links l ON l.id = e.link_id
    WHERE e.artist_id=p_artist_id AND e.event='arrival'
      AND e.created_at >= p_from::timestamptz AND e.created_at < (p_to+1)::timestamptz
    GROUP BY 1
  ),
  evcn AS (SELECT * FROM evc WHERE canal <> 'teste'),
  cm AS (
    SELECT 'meta'::text platform, s.connection_id, s.external_campaign_id cid, s.name nome,
      coalesce(s.effective_status,s.status) st, s.objective objetivo,
      (SELECT string_agg(DISTINCT a.optimization_goal, ',') FROM crm.meta_adset_snapshot a
        WHERE a.connection_id=s.connection_id AND a.external_campaign_id=s.external_campaign_id) otimizacao,
      nullif(s.daily_budget_cents,0)/100.0 orc, s.linked_song_id song, s.last_synced_at leitura_meta
    FROM crm.meta_campaign_snapshot s JOIN conns c ON c.id=s.connection_id
    UNION ALL
    SELECT 'google', g.connection_id, g.external_campaign_id, g.name, g.status, g.advertising_channel_type,
      g.bidding_strategy_type, g.budget_amount_micros/1000000.0, g.linked_song_id, g.last_synced_at
    FROM crm.google_campaign g JOIN conns c ON c.id=g.connection_id
    UNION ALL
    SELECT 'tiktok', t.connection_id, t.external_campaign_id, t.name, t.status, t.objective,
      (SELECT string_agg(DISTINCT coalesce(ag.raw->>'optimization_goal', ag.raw->>'otimizacao'), ',') FROM crm.tiktok_adgroup ag
        WHERE ag.connection_id=t.connection_id AND ag.external_campaign_id=t.external_campaign_id),
      coalesce(nullif(t.budget_cents,0),
        (SELECT nullif(sum(ag.budget_cents),0) FROM crm.tiktok_adgroup ag
          WHERE ag.connection_id=t.connection_id AND ag.external_campaign_id=t.external_campaign_id
            AND upper(coalesce(ag.status,'')) IN ('ENABLE','ACTIVE')))/100.0,
      t.linked_song_id, t.last_synced_at
    FROM crm.tiktok_campaign_carreira t JOIN conns c ON c.id=t.connection_id
  ),
  agg AS (
    SELECT platform, connection_id, cid,
      max(currency) currency, max(ctry) ctry,
      min(dia) FILTER (WHERE spend>0) d0, max(dia) FILTER (WHERE spend>0) d1,
      min(dia) primeira_linha, max(dia) ultima_linha,
      count(DISTINCT dia) FILTER (WHERE spend>0) dias_entrega,
      round(sum(spend),2) gasto, round(sum(spend_ref),2) gasto_ref,
      count(*) FILTER (WHERE fx_miss) fx_missing,
      sum(imp) imp, sum(clk) clk, sum(lc) lc,
      sum(m3s) m3s, sum(mthru) mthru, sum(p25) p25, sum(p50) p50, sum(p75) p75, sum(p100) p100,
      sum(gviews) gviews, sum(t2s) t2s, sum(t6s) t6s, sum(likes) likes, sum(follows) follows,
      max(leitura) leitura, CASE WHEN bool_and(src='manual') THEN 'manual' ELSE 'api' END src
    FROM cdr GROUP BY 1,2,3
  ),
  camp AS (
    SELECT a.*, m.nome, m.objetivo, m.otimizacao, m.orc, m.song, c.selected_ad_account_id account_id,
      CASE WHEN upper(coalesce(m.st,'')) IN ('ACTIVE','ENABLED','ENABLE','CAMPAIGN_STATUS_ENABLE') THEN 'ativo'
           WHEN upper(coalesce(m.st,'')) IN ('PAUSED','DISABLE','CAMPAIGN_PAUSED','ADSET_PAUSED','CAMPAIGN_STATUS_DISABLE') THEN 'pausado'
           WHEN upper(coalesce(m.st,'')) IN ('REMOVED','DELETED','DELETE','ARCHIVED') THEN 'removido'
           ELSE 'outro' END estado,
      public.artist_ads_campaign_key(m.nome) nkey, cs.ok_ate
    FROM agg a LEFT JOIN cm m ON m.platform=a.platform AND m.connection_id=a.connection_id AND m.cid=a.cid
    JOIN conns c ON c.id=a.connection_id
    LEFT JOIN conn_sync cs ON cs.id=a.connection_id
  ),
  camp2 AS (
    SELECT cp.*,
      CASE
        WHEN cp.platform='tiktok' AND cp.nome ~* 'visualiza' THEN 'views_6s'
        WHEN cp.platform='tiktok' AND cp.nome ~* 'tr[aá]fego' THEN 'chegada_smart_link'
        WHEN cp.platform='meta' AND cp.nome ~* '^\s*\[mp\]' AND coalesce(cp.objetivo,'') ~* 'traffic|link_clicks' THEN 'chegada_smart_link'
        WHEN cp.platform='meta' AND coalesce(cp.otimizacao,'') ~* 'VISIT_INSTAGRAM_PROFILE|PROFILE_VISIT|PROFILE_AND_PAGE_ENGAGEMENT' THEN 'cliques_perfil'
        WHEN cp.platform='google' AND coalesce(cp.objetivo,'')='VIDEO' AND coalesce(cp.otimizacao,'')='TARGET_CPM' THEN 'impressoes'
      END rtipo,
      ch.n chegadas, ch.v visitantes
    FROM camp cp
    LEFT JOIN LATERAL (SELECT coalesce(sum(x.n),0) n, coalesce(sum(x.v),0) v FROM evk x
        WHERE CASE cp.platform WHEN 'tiktok' THEN x.src='tiktok'
                               WHEN 'meta' THEN x.src IN ('meta','facebook','instagram','fb','ig')
                               ELSE false END
          AND (x.k = cp.nkey OR cp.nkey LIKE x.k||'%' OR x.k LIKE cp.nkey||'%')) ch ON true
  ),
  camp2b AS (
    SELECT c2.*,
      CASE c2.rtipo
        WHEN 'views_6s' THEN 's6'
        WHEN 'chegada_smart_link' THEN CASE WHEN c2.chegadas>0 THEN NULL ELSE 'clk' END
        WHEN 'cliques_perfil' THEN 'lc'
        WHEN 'impressoes' THEN 'imp'
      END mcol
    FROM camp2 c2
  ),
  camp2c AS (
    SELECT c.*, coalesce(sm.valor,0) sem_med_valor, sm.dias sem_med_dias,
      round(c.gasto - coalesce(sm.valor,0),2) gasto_medido
    FROM camp2b c
    LEFT JOIN LATERAL (
      SELECT round(sum(x.spend - coalesce(CASE c.mcol WHEN 's6' THEN x.sm6 WHEN 'clk' THEN x.smc WHEN 'lc' THEN x.sml ELSE x.smi END,0)),2) valor,
             array_agg(x.dia ORDER BY x.dia) dias
      FROM cd x
      WHERE c.mcol IS NOT NULL AND x.platform=c.platform AND x.connection_id=c.connection_id AND x.cid=c.cid
        AND coalesce(x.spend,0) - coalesce(CASE c.mcol WHEN 's6' THEN x.sm6 WHEN 'clk' THEN x.smc WHEN 'lc' THEN x.sml ELSE x.smi END,0) > 0.004
    ) sm ON true
  ),
  camp3 AS (
    SELECT c2.*,
      CASE c2.rtipo
        WHEN 'views_6s' THEN jsonb_build_object('nome','views_6s','valor',c2.t6s,'custo',CASE WHEN c2.t6s>0 THEN round(c2.gasto_medido/c2.t6s,6) END)
        WHEN 'chegada_smart_link' THEN
          CASE WHEN c2.chegadas>0 THEN jsonb_build_object('nome','chegada_smart_link','valor',c2.chegadas,'custo',round(c2.gasto_medido/c2.chegadas,4))
               ELSE jsonb_build_object('nome','chegada_smart_link','valor',c2.clk,'custo',CASE WHEN c2.clk>0 THEN round(c2.gasto_medido/c2.clk,4) END) END
        WHEN 'cliques_perfil' THEN jsonb_build_object('nome','cliques_perfil','rotulo','Cliques para o perfil','valor',c2.lc,
          'custo',CASE WHEN c2.lc>0 THEN round(c2.gasto_medido/c2.lc,4) END)
        WHEN 'impressoes' THEN jsonb_build_object('nome','impressoes','valor',c2.imp,'custo',CASE WHEN c2.imp>0 THEN round(c2.gasto_medido/(c2.imp/1000.0),4) END)
      END resultado,
      CASE c2.rtipo
        WHEN 'views_6s' THEN 'visualizações de 6 s da plataforma'
        WHEN 'chegada_smart_link' THEN CASE WHEN c2.chegadas>0 THEN 'song_link_events arrival por utm_source+utm_campaign'
                                            ELSE 'fallback: cliques (sem UTM correspondente)' END
        WHEN 'cliques_perfil' THEN 'insights Meta: actions link_click (destino perfil Instagram por optimization_goal)'
        WHEN 'impressoes' THEN 'impressões; custo = CPM'
      END resultado_origem,
      (SELECT array_agg(gs::date ORDER BY gs)
         FROM generate_series(c2.primeira_linha,
                CASE WHEN c2.estado='ativo' THEN least(p_to, current_date-1) ELSE c2.ultima_linha END, '1 day') gs
         WHERE NOT EXISTS (SELECT 1 FROM cd x WHERE x.platform=c2.platform AND x.connection_id=c2.connection_id AND x.cid=c2.cid AND x.dia=gs::date)) sem_linha,
      (SELECT jsonb_build_object('nome', coalesce(p.resumo->'meta'->>'nome', g.resultado_nome),
                                 'valor', coalesce((p.resumo->'meta'->>'valor')::numeric, g.meta_valor))
         FROM (SELECT 1) one
         LEFT JOIN LATERAL (SELECT pp.resumo FROM crm.meta_publish_plan pp
                 WHERE pp.company_id=v_company AND pp.artist_id=p_artist_id
                   AND coalesce(pp.external_campaign_id, pp.meta_campaign_id)=c2.cid
                   AND jsonb_typeof(pp.resumo->'meta')='object' AND (pp.resumo->'meta'->>'valor') IS NOT NULL
                 ORDER BY pp.created_at DESC LIMIT 1) p ON true
         LEFT JOIN LATERAL (SELECT gg.resultado_nome, gg.meta_valor FROM public.artist_ads_campaign_goals gg
                 WHERE gg.company_id=v_company AND gg.platform=c2.platform AND gg.external_campaign_id=c2.cid
                   AND gg.nivel='campaign' AND gg.valido_desde<=p_to
                 ORDER BY gg.valido_desde DESC LIMIT 1) g ON true
         WHERE p.resumo IS NOT NULL OR g.resultado_nome IS NOT NULL) meta_obj,
      (SELECT (gc.reach->k->>'unique_users')::numeric FROM crm.google_campaign gc, jsonb_object_keys(coalesce(gc.reach,'{}'::jsonb)) k
        WHERE c2.platform='google' AND gc.connection_id=c2.connection_id AND gc.external_campaign_id=c2.cid
          AND gc.reach->k->>'periodo' = p_from::text||'..'||p_to::text
          AND (gc.reach->k->>'unique_users') ~ '^[0-9]+$' LIMIT 1) alcance
    FROM camp2c c2
  ),
  camp4 AS (
    SELECT c.*,
      CASE WHEN c.src='manual' THEN c.sem_linha
           ELSE (SELECT array_agg(d ORDER BY d) FROM unnest(c.sem_linha) d
                 WHERE c.ok_ate IS NULL OR c.ok_ate < (d+1)::timestamptz) END sem_leitura,
      CASE WHEN c.src='manual' THEN NULL
           ELSE (SELECT array_agg(d ORDER BY d) FROM unnest(c.sem_linha) d
                 WHERE c.ok_ate >= (d+1)::timestamptz) END sem_entrega
    FROM camp3 c
  ),
  camp_json AS (
    SELECT c.platform, c.connection_id, c.gasto, c.gasto_ref, jsonb_build_object(
      'campaign_id', c.cid, 'nome', c.nome, 'account_id', c.account_id, 'currency', c.currency,
      'market_country', nullif(c.ctry,'?'),
      'estado_normalizado', c.estado, 'objetivo', c.objetivo, 'otimizacao', c.otimizacao,
      'orcamento_diario', c.orc, 'primeiro_dia', c.d0, 'ultimo_dia', c.d1, 'dias_com_entrega', c.dias_entrega,
      'gasto', c.gasto, 'gasto_ref', c.gasto_ref, 'impressoes', c.imp, 'cliques', c.clk,
      'cliques_link', CASE WHEN c.platform='meta' THEN c.lc END,
      'gasto_sem_medicao', CASE WHEN c.rtipo IS NOT NULL THEN jsonb_build_object('valor', c.sem_med_valor,
                             'dias', coalesce(to_jsonb(c.sem_med_dias),'[]'::jsonb)) END,
      'chegadas_eventos', CASE WHEN c.platform IN ('meta','tiktok') THEN c.chegadas END,
      'visitantes_unicos_dia', CASE WHEN c.platform IN ('meta','tiktok') THEN c.visitantes END,
      'ctr', CASE WHEN c.imp>0 THEN round(c.clk/c.imp*100,4) END,
      'cpc', CASE WHEN c.clk>0 THEN round(c.gasto/c.clk,4) END,
      'cpm', CASE WHEN c.imp>0 THEN round(c.gasto/c.imp*1000,4) END,
      'video', CASE c.platform
        WHEN 'meta' THEN jsonb_build_object('meta_3s',c.m3s,'meta_thruplay',c.mthru,'meta_p25',c.p25,'meta_p50',c.p50,'meta_p75',c.p75,'meta_p100',c.p100)
        WHEN 'google' THEN jsonb_build_object('google_views',c.gviews)
        ELSE jsonb_build_object('tiktok_2s',c.t2s,'tiktok_6s',c.t6s) END,
      'tiktok', CASE WHEN c.platform='tiktok' THEN jsonb_build_object('gostos',c.likes,'seguidores',c.follows) END,
      'resultado', c.resultado,
      'alcance_periodo', c.alcance,
      'meta', c.meta_obj,
      'fonte', jsonb_build_object('data_source', c.src, 'ultimo_dia_com_dados', c.ultima_linha,
               'ultima_leitura', c.leitura, 'dias_sem_leitura', coalesce(to_jsonb(c.sem_leitura),'[]'::jsonb),
               'dias_sem_entrega', coalesce(to_jsonb(c.sem_entrega),'[]'::jsonb),
               'ultimo_sync_ok', c.ok_ate,
               'resultado_origem', c.resultado_origem,
               'nota_resultado', CASE WHEN c.rtipo='cliques_perfil'
                 THEN 'contagem de ações da Meta (janela de atribuição); pode diferir de Cliques (todos)' END,
               'custo_resultado', 'gasto dos dias/grupos em que o resultado foi lido ÷ resultado (exclui gasto_sem_medicao)',
               'metodo_chegadas', CASE WHEN c.platform IN ('meta','tiktok')
                 THEN 'chegadas = carregamentos da página; visitantes = IP anonimizado único por dia' END),
      'linked_song_id', c.song) j,
      c.rtipo, c.resultado_origem, c.nome, c.sem_leitura, c.fx_missing, c.song,
      c.currency, c.sem_med_valor, c.sem_med_dias
    FROM camp4 c
  ),
  plat AS (
    SELECT p.platform,
      jsonb_build_object('platform', p.platform,
        'contas', (SELECT coalesce(jsonb_agg(jsonb_build_object('account_id', c.selected_ad_account_id,
                     'account_name', c.selected_ad_account_name, 'currency', c.selected_ad_account_currency,
                     'gestor', CASE WHEN c.selected_ad_account_name ~* '^\s*mp\M'
                                      OR EXISTS (SELECT 1 FROM cm x WHERE x.connection_id=c.id AND (x.nome ~* '^\s*\[mp\]' OR x.cid LIKE 'manual:mp-%'))
                                    THEN 'mp' ELSE 'externo' END) ORDER BY c.selected_ad_account_name),'[]'::jsonb)
                   FROM conns c WHERE c.platform=p.platform),
        'campanhas', (SELECT coalesce(jsonb_agg(cj.j ORDER BY cj.gasto DESC NULLS LAST),'[]'::jsonb) FROM camp_json cj WHERE cj.platform=p.platform),
        'serie_diaria', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',s.dia,'currency',s.currency,'gasto',s.g,'gasto_ref',s.gr) ORDER BY s.dia, s.currency),'[]'::jsonb)
                   FROM (SELECT dia, currency, round(sum(spend),2) g, round(sum(spend_ref),2) gr FROM cdr WHERE cdr.platform=p.platform GROUP BY 1,2) s),
        'chegadas', nullif(pc.n,0), 'visitantes', nullif(pc.v,0),
        'chegadas_sem_pais', CASE WHEN p_country IS NOT NULL THEN coalesce(pc.sp,0) END,
        'gasto_trafego', g1.gt, 'gasto_total', g2.gtot,
        'custo_por_chegada', CASE WHEN pc.n > 0 AND g1.gt > 0 THEN round(g1.gt / pc.n, 4) END,
        'custo_por_chegada_moeda', v_ref,
        'metodo_chegadas', 'chegadas de todos os links/eventos cujo canal efetivo (song_link_event_canal) mapeia nesta plataforma; com p_country só eventos desse país (song_link_events.country); custo = gasto_trafego ÷ chegadas'
      ) j
    FROM (SELECT DISTINCT platform FROM conns) p
    LEFT JOIN LATERAL (SELECT sum(x.n) n, sum(x.v) v, sum(x.sp) sp FROM evcn x
      WHERE CASE x.canal WHEN 'tiktok_ads' THEN 'tiktok' WHEN 'meta_ads' THEN 'meta' WHEN 'google_ads' THEN 'google' END = p.platform) pc ON true
    LEFT JOIN LATERAL (SELECT round(coalesce(sum(cj.gasto_ref),0),2) gt FROM camp_json cj
      WHERE cj.platform=p.platform AND cj.rtipo='chegada_smart_link') g1 ON true
    LEFT JOIN LATERAL (SELECT round(sum(spend_ref),2) gtot FROM cdr WHERE cdr.platform=p.platform) g2 ON true
  )
  SELECT
    (SELECT coalesce(jsonb_agg(j ORDER BY array_position(ARRAY['meta','google','tiktok'], platform)),'[]'::jsonb) FROM plat),
    jsonb_build_object(
      'gasto_ref', CASE WHEN (SELECT count(DISTINCT (ctry, currency)) FROM cdr WHERE spend>0) <= 1
                        THEN (SELECT round(sum(spend_ref),2) FROM cdr) END,
      'filtro_pais', upper(p_country),
      'chegadas_por_canal', (SELECT coalesce(jsonb_object_agg(canal, jsonb_build_object('chegadas', n, 'visitantes', v)), '{}'::jsonb) FROM evcn WHERE n > 0),
      'por_pais', (SELECT coalesce(jsonb_agg(jsonb_build_object('pais', nullif(pp.ctry,'?'), 'moedas', pp.moedas) ORDER BY pp.ctry),'[]'::jsonb)
        FROM (SELECT x.ctry, jsonb_agg(jsonb_build_object(
                'currency', x.currency, 'gasto', x.g, 'impressoes', x.imp, 'cliques', x.clk,
                'ctr', CASE WHEN x.imp>0 THEN round(x.clk/x.imp*100,4) END,
                'cpc', CASE WHEN x.clk>0 THEN round(x.g/x.clk,4) END,
                'cpm', CASE WHEN x.imp>0 THEN round(x.g/x.imp*1000,4) END,
                'views', jsonb_build_object('meta_3s',x.m3s,'meta_thruplay',x.mthru,'google_views',x.gv,'tiktok_2s',x.t2s,'tiktok_6s',x.t6s),
                'campanhas', x.nc) ORDER BY x.currency) moedas
              FROM (SELECT ctry, currency, round(sum(spend),2) g, sum(imp) imp, sum(clk) clk, sum(m3s) m3s, sum(mthru) mthru,
                           sum(gviews) gv, sum(t2s) t2s, sum(t6s) t6s, count(DISTINCT (platform, connection_id, cid)) nc
                    FROM cdr GROUP BY 1,2 HAVING sum(spend)>0 OR sum(imp)>0) x
              GROUP BY x.ctry) pp),
      'fx_missing_days', (SELECT count(DISTINCT dia) FROM cdr WHERE fx_miss),
      'gasto_por_moeda', (SELECT coalesce(jsonb_agg(jsonb_build_object('currency',currency,'valor',v) ORDER BY currency),'[]'::jsonb)
                          FROM (SELECT currency, round(sum(spend),2) v FROM cdr GROUP BY 1 HAVING sum(spend)>0) z),
      'impressoes', (SELECT sum(imp) FROM cdr), 'cliques', (SELECT sum(clk) FROM cdr),
      'views', jsonb_build_object('meta_3s',(SELECT sum(m3s) FROM cdr),'meta_thruplay',(SELECT sum(mthru) FROM cdr),
        'google_views',(SELECT sum(gviews) FROM cdr),'tiktok_2s',(SELECT sum(t2s) FROM cdr),'tiktok_6s',(SELECT sum(t6s) FROM cdr))),
    (SELECT coalesce(jsonb_agg(l),'[]'::jsonb) FROM (
      SELECT 'Conta '||coalesce(c.selected_ad_account_name,c.selected_ad_account_id)||' ('||c.platform||', '||coalesce(c.selected_ad_account_currency,'?')||'): sem entrega no período' l
        FROM conns c WHERE NOT EXISTS (SELECT 1 FROM cdr WHERE cdr.connection_id=c.id AND cdr.spend>0)
      UNION ALL SELECT 'Campanha "'||coalesce(nome,'?')||'": resultado '||resultado_origem
        FROM camp_json WHERE resultado_origem LIKE 'fallback%'
      UNION ALL SELECT 'Campanha "'||coalesce(nome,'?')||'": sem regra de resultado para o objetivo — resultado null' FROM camp_json WHERE rtipo IS NULL
      UNION ALL SELECT 'Campanha "'||coalesce(nome,'?')||'": dias sem leitura '||array_to_string(sem_leitura, ', ') FROM camp_json WHERE cardinality(sem_leitura)>0
      UNION ALL SELECT 'gasto sem medição: '
             ||CASE currency WHEN 'BRL' THEN 'R$' WHEN 'EUR' THEN '€' WHEN 'USD' THEN 'US$' ELSE coalesce(currency,'?') END||' '
             ||translate(to_char(sem_med_valor,'FM999,999,990.00'), ',.', '.,')
             ||' a '||(SELECT string_agg(to_char(d,'DD/MM'), ', ' ORDER BY d) FROM unnest(sem_med_dias) d)
             ||' — '||coalesce(nome,'?')
        FROM camp_json WHERE sem_med_valor > 0
      UNION ALL SELECT 'Campanha "'||coalesce(nome,'?')||'": '||fx_missing||' dia(s) sem câmbio para '||v_ref FROM camp_json WHERE fx_missing>0
      UNION ALL SELECT 'Sem total convertido: período com vários países/moedas — usar totais.por_pais'
        WHERE (SELECT count(DISTINCT (ctry, currency)) FROM cdr WHERE spend>0) > 1
      UNION ALL SELECT 'Campanha "'||coalesce(nome,'?')||'": sem país de mercado (market_country null)'
        FROM camp_json WHERE j->>'market_country' IS NULL AND (j->>'gasto')::numeric > 0
      UNION ALL SELECT 'Alcance do período: não há alcance único gravado para este período (alcance diário não se soma) — alcance_periodo null'
        WHERE EXISTS (SELECT 1 FROM camp3 WHERE alcance IS NULL)
    ) q)
  INTO v_plat, v_tot, v_lac;

  WITH songs AS (
    SELECT DISTINCT s.id, s.title FROM public.artist_songs s
    WHERE s.artist_id=p_artist_id AND s.id IN (
      SELECT (c->>'linked_song_id')::uuid FROM jsonb_array_elements(v_plat) p, jsonb_array_elements(p->'campanhas') c
      WHERE c->>'linked_song_id' IS NOT NULL)
  ),
  m AS (
    SELECT d.* FROM public.artist_song_metrics_daily d JOIN songs s ON s.id=d.song_id
    WHERE d.metric_date BETWEEN p_from AND p_to
  ),
  ouv AS (
    SELECT DISTINCT ON (song_id, metric_date) song_id, metric_date, value FROM m
    WHERE metric='s4a_listeners_28d' ORDER BY song_id, metric_date, (source='s4a_api') DESC, captured_at DESC
  ),
  ugc AS (
    SELECT DISTINCT ON (song_id, metric_date) song_id, metric_date, value, source FROM m
    WHERE metric='ugc_videos' AND platform='tiktok' AND source IN ('ios_shortcut','manual')
    ORDER BY song_id, metric_date, CASE source WHEN 'ios_shortcut' THEN 1 ELSE 2 END, captured_at DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'song_id', s.id, 'titulo', s.title,
      'streams_s4a_periodo', (SELECT sum(value) FROM m WHERE m.song_id=s.id AND metric='s4a_streams_day'),
      'ouvintes_inicio', (SELECT jsonb_build_object('valor',value,'data',metric_date) FROM ouv WHERE ouv.song_id=s.id ORDER BY metric_date LIMIT 1),
      'ouvintes_fim', (SELECT jsonb_build_object('valor',value,'data',metric_date) FROM ouv WHERE ouv.song_id=s.id ORDER BY metric_date DESC LIMIT 1),
      'ugc_inicio', (SELECT jsonb_build_object('valor',value,'data',metric_date,'source',source) FROM ugc WHERE ugc.song_id=s.id ORDER BY metric_date LIMIT 1),
      'ugc_fim', (SELECT jsonb_build_object('valor',value,'data',metric_date,'source',source) FROM ugc WHERE ugc.song_id=s.id ORDER BY metric_date DESC LIMIT 1)
    ) ORDER BY s.title),'[]'::jsonb)
  INTO v_mus FROM songs s;

  v_out := jsonb_build_object(
    'artista', jsonb_build_object('id', p_artist_id, 'nome', v_nome),
    'periodo', jsonb_build_object('de', p_from, 'ate', p_to, 'dias', (p_to - p_from) + 1),
    'gerado_em', now(),
    'ref_currency', v_ref,
    'totais', v_tot,
    'plataformas', v_plat,
    'musica', v_mus,
    'lacunas', v_lac);
  RETURN v_out;
END $function$
;

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

  v_company := public.artist_access_check(p_artist_id,'traffic_write',NULL);

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

  -- D-ERP167: só o smart link MP activo da música (song_links).
  SELECT 'https://www.mundopropicio.com/m/' || l.slug INTO v_smart
  FROM public.song_links l
  WHERE l.song_id = p_song_id AND l.active AND l.company_id = v_company
  ORDER BY l.updated_at DESC LIMIT 1;
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
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_plan_get(p_plan_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_company uuid; v_artist uuid; v_out jsonb;
BEGIN
  SELECT artist_id INTO v_artist FROM crm.meta_publish_plan
  WHERE id = p_plan_id AND song_id IS NOT NULL;
  IF v_artist IS NULL THEN
    RAISE EXCEPTION 'plano de alvo música inexistente' USING ERRCODE = '22023';
  END IF;
  v_company := public.artist_access_check(v_artist,'read','traffic');

  -- D-ERP167: song_smart_link_url mantém a chave, mas vem de song_links.
  SELECT to_jsonb(p) || jsonb_build_object(
           'platform','meta',
           'song_title', s.title,
           'song_smart_link_url', (
             SELECT 'https://www.mundopropicio.com/m/' || l.slug
             FROM public.song_links l
             WHERE l.song_id = p.song_id AND l.active AND l.company_id = v_company
             ORDER BY l.updated_at DESC LIMIT 1),
           'connection', jsonb_build_object(
             'id', c.id, 'platform', c.platform, 'status', c.status,
             'ad_account_id', c.selected_ad_account_id,
             'ad_account_name', c.selected_ad_account_name,
             'currency', c.selected_ad_account_currency)
         ) - 'publish_error'
    INTO v_out
  FROM crm.meta_publish_plan p
  LEFT JOIN public.artist_songs s ON s.id = p.song_id
  LEFT JOIN crm.ad_platform_connections c ON c.id = p.connection_id
  WHERE p.id = p_plan_id AND p.company_id = v_company;

  IF v_out IS NULL THEN
    RAISE EXCEPTION 'plano fora do âmbito' USING ERRCODE = '42501';
  END IF;
  RETURN v_out;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_plan_list(p_artist_id uuid, p_platform text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, platform text, song_id uuid, song_title text, objetivo text, orcamento_total_cents bigint, moeda text, estado text, start_time timestamp with time zone, end_time timestamp with time zone, created_at timestamp with time zone, external_campaign_id text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_access_check(p_artist_id,'read','traffic');
  RETURN QUERY
  SELECT p.id, p.platform, p.song_id, s.title,
         p.objetivo, p.orcamento_total_cents, p.moeda, p.estado,
         p.start_time, p.end_time, p.created_at,
         COALESCE(p.external_campaign_id, p.meta_campaign_id)
  FROM crm.meta_publish_plan p
  LEFT JOIN public.artist_songs s ON s.id = p.song_id
  WHERE p.artist_id = p_artist_id
    AND p.song_id IS NOT NULL
    AND p.company_id = v_company
    AND (p_platform IS NULL OR p.platform = p_platform)
  ORDER BY p.created_at DESC;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_plan_update(p_plan_id uuid, p_plan jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_p crm.meta_publish_plan; v_company uuid; v_smart text; v_ok jsonb;
BEGIN
  SELECT * INTO v_p FROM crm.meta_publish_plan
  WHERE id = p_plan_id AND song_id IS NOT NULL;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'plano de alvo música inexistente' USING ERRCODE = '22023';
  END IF;
  v_company := public.artist_access_check(v_p.artist_id,'traffic_write',NULL);
  IF v_p.company_id <> v_company THEN
    RAISE EXCEPTION 'plano fora do âmbito' USING ERRCODE = '42501';
  END IF;
  IF v_p.estado NOT IN ('rascunho','falhado') THEN
    RAISE EXCEPTION 'só é possível editar planos em rascunho ou falhados (estado: %)', v_p.estado USING ERRCODE = '22023';
  END IF;

  -- D-ERP167: só o smart link MP activo da música (song_links).
  SELECT 'https://www.mundopropicio.com/m/' || l.slug INTO v_smart
  FROM public.song_links l
  WHERE l.song_id = v_p.song_id AND l.active AND l.company_id = v_company
  ORDER BY l.updated_at DESC LIMIT 1;
  v_ok := public.artist_ads_plan_validate(p_plan, v_smart);

  UPDATE crm.meta_publish_plan SET
    objetivo = v_ok->>'objetivo',
    orcamento_total_cents = nullif(p_plan->>'orcamento_total_cents','')::bigint,
    link_destino = v_ok->>'link_destino',
    adsets = v_ok->'adsets',
    resumo = coalesce(p_plan->'resumo', resumo),
    start_time = nullif(p_plan->>'start_time','')::timestamptz,
    end_time = nullif(p_plan->>'end_time','')::timestamptz,
    updated_at = now()
  WHERE id = p_plan_id;
  RETURN p_plan_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_promotable_posts(p_artist_id uuid, p_platform text DEFAULT 'meta'::text)
 RETURNS TABLE(source text, platform text, post_ref text, post_kind text, permalink text, thumbnail_url text, caption_excerpt text, published_at timestamp with time zone, song_id uuid, meta_ready boolean, last_ad_name text, spend_30d_cents bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_access_check(p_artist_id,'read','traffic');

  IF p_platform = 'tiktok' THEN
    RETURN QUERY
    SELECT 'artist_content'::text, 'tiktok'::text, ac.external_id, 'tiktok_video'::text,
           ac.permalink, ac.thumbnail_url, ac.caption_excerpt, ac.published_at, ac.song_id,
           (ac.external_id IS NOT NULL) AS meta_ready, NULL::text, 0::bigint
    FROM public.artist_content ac
    WHERE ac.artist_id = p_artist_id AND ac.company_id = v_company
      AND ac.platform = 'tiktok' AND ac.content_type = 'video' AND ac.external_id IS NOT NULL
    ORDER BY ac.published_at DESC NULLS LAST;
    RETURN;
  END IF;

  -- YouTube (campanhas Google Ads de vídeo): o post_ref é o id do vídeo no YouTube (D-ERP108)
  IF p_platform IN ('google','youtube') THEN
    RETURN QUERY
    SELECT 'artist_content'::text, 'youtube'::text, ac.external_id, 'youtube_video'::text,
           ac.permalink, ac.thumbnail_url, ac.caption_excerpt, ac.published_at, ac.song_id,
           (ac.external_id ~ '^[A-Za-z0-9_-]{11}$') AS meta_ready, NULL::text, 0::bigint
    FROM public.artist_content ac
    WHERE ac.artist_id = p_artist_id AND ac.company_id = v_company
      AND ac.platform = 'youtube' AND ac.external_id IS NOT NULL
    ORDER BY ac.published_at DESC NULLS LAST;
    RETURN;
  END IF;

  IF p_platform IS DISTINCT FROM 'meta' THEN
    RAISE EXCEPTION 'plataforma não suportada' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH conns AS (
    SELECT c.id FROM crm.ad_platform_connections c
    WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id
      AND c.company_id = v_company AND c.platform = 'meta'
  ),
  ads AS (
    SELECT s.external_ad_id, s.name AS ad_name, s.updated_time,
           s.raw->'creative'->>'effective_object_story_id'     AS osi,
           s.raw->'creative'->>'effective_instagram_media_id'  AS igid,
           s.raw->'creative'->>'instagram_permalink_url'       AS permalink,
           s.raw->'creative'->>'thumbnail_url'                 AS thumb
    FROM crm.meta_ad_snapshot s
    JOIN conns c ON c.id = s.connection_id
  ),
  refs AS (
    SELECT *, coalesce(osi, igid) AS post_ref,
           CASE WHEN osi IS NOT NULL THEN 'object_story' ELSE 'instagram_media' END AS post_kind
    FROM ads WHERE coalesce(osi, igid) IS NOT NULL
  ),
  spend AS (
    SELECT i.external_ad_id, sum(i.spend_cents)::bigint AS sc
    FROM crm.meta_ad_insights_daily i
    JOIN conns c ON c.id = i.connection_id
    WHERE i.date_start >= (current_date - 29)
    GROUP BY 1
  ),
  hist AS (
    SELECT DISTINCT ON (r.post_ref) r.post_ref, r.post_kind, r.permalink, r.thumb, r.ad_name
    FROM refs r ORDER BY r.post_ref, r.updated_time DESC NULLS LAST
  ),
  hist_spend AS (
    SELECT r.post_ref, sum(coalesce(sp.sc,0))::bigint AS sc
    FROM refs r LEFT JOIN spend sp ON sp.external_ad_id = r.external_ad_id GROUP BY 1
  ),
  hist_out AS (
    SELECT 'ad_history'::text AS source, 'meta'::text AS platform,
           h.post_ref, h.post_kind, h.permalink, h.thumb AS thumbnail_url,
           NULL::text AS caption_excerpt, NULL::timestamptz AS published_at,
           NULL::uuid AS song_id, true AS meta_ready,
           h.ad_name AS last_ad_name, coalesce(hs.sc,0)::bigint AS spend_30d_cents
    FROM hist h LEFT JOIN hist_spend hs ON hs.post_ref = h.post_ref
  ),
  content_out AS (
    SELECT 'artist_content'::text, 'meta'::text, ac.external_id, 'instagram_media'::text,
           ac.permalink, ac.thumbnail_url, ac.caption_excerpt, ac.published_at, ac.song_id,
           (ac.source = 'platform_api' AND ac.external_id ~ '^[0-9]{10,}$') AS meta_ready,
           NULL::text, 0::bigint
    FROM public.artist_content ac
    WHERE ac.artist_id = p_artist_id AND ac.company_id = v_company
      AND ac.platform = 'instagram' AND ac.external_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM hist_out h WHERE h.post_ref = ac.external_id)
  )
  SELECT * FROM hist_out UNION ALL SELECT * FROM content_out;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_set_link_kind(p_platform text, p_campaign_id text, p_artist_id uuid, p_kind text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_company uuid; v_n int := 0;
BEGIN
  IF p_platform NOT IN ('google','meta','tiktok') THEN
    RAISE EXCEPTION 'plataforma inválida' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NOT NULL AND p_kind NOT IN ('song','profile','event') THEN
    RAISE EXCEPTION 'tipo inválido' USING ERRCODE = '22023';
  END IF;
  v_company := public.artist_access_check(p_artist_id,'traffic_write',NULL);
  IF v_uid IS NOT NULL AND NOT public.user_has_company_access(v_company, ARRAY['admin','manager','marketing_manager']::public.app_role[]) THEN
    RAISE EXCEPTION 'sem permissão' USING ERRCODE = '42501';
  END IF;
  IF p_platform = 'google' THEN
    UPDATE crm.google_campaign x SET link_kind = p_kind, link_kind_locked = true
    WHERE x.external_campaign_id = p_campaign_id AND EXISTS (SELECT 1 FROM crm.ad_platform_connections c
      WHERE c.id = x.connection_id AND c.connection_scope='artist' AND c.artist_id = p_artist_id AND c.company_id = v_company);
  ELSIF p_platform = 'meta' THEN
    UPDATE crm.meta_campaign_snapshot x SET link_kind = p_kind, link_kind_locked = true
    WHERE x.external_campaign_id = p_campaign_id AND EXISTS (SELECT 1 FROM crm.ad_platform_connections c
      WHERE c.id = x.connection_id AND c.connection_scope='artist' AND c.artist_id = p_artist_id AND c.company_id = v_company);
  ELSE
    UPDATE crm.tiktok_campaign x SET link_kind = p_kind, link_kind_locked = true
    WHERE x.external_campaign_id = p_campaign_id AND EXISTS (SELECT 1 FROM crm.ad_platform_connections c
      WHERE c.id = x.connection_id AND c.connection_scope='artist' AND c.artist_id = p_artist_id AND c.company_id = v_company);
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_set_market_country(p_platform text, p_campaign_id text, p_country text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_c text := upper(nullif(trim(p_country),'')); v_n int := 0;
BEGIN
  IF p_platform NOT IN ('google','meta','tiktok') THEN RAISE EXCEPTION 'plataforma inválida' USING ERRCODE='22023'; END IF;
  IF v_c IS NOT NULL AND v_c !~ '^([A-Z]{2}|MULTI)$' THEN RAISE EXCEPTION 'país inválido (ISO-2 ou MULTI)' USING ERRCODE='22023'; END IF;
  IF p_platform = 'google' THEN
    UPDATE crm.google_campaign x SET market_country = coalesce(v_c, x.market_country), market_country_locked = (v_c IS NOT NULL)
    WHERE x.external_campaign_id = p_campaign_id AND public.artist_access_ok((SELECT pc.artist_id FROM crm.ad_platform_connections pc WHERE pc.id = x.connection_id),'traffic_write',NULL);
  ELSIF p_platform = 'meta' THEN
    UPDATE crm.meta_campaign_snapshot x SET market_country = coalesce(v_c, x.market_country), market_country_locked = (v_c IS NOT NULL)
    WHERE x.external_campaign_id = p_campaign_id AND public.artist_access_ok((SELECT pc.artist_id FROM crm.ad_platform_connections pc WHERE pc.id = x.connection_id),'traffic_write',NULL);
  ELSE
    UPDATE crm.tiktok_campaign x SET market_country = coalesce(v_c, x.market_country), market_country_locked = (v_c IS NOT NULL)
    WHERE x.external_campaign_id = p_campaign_id AND public.artist_access_ok((SELECT pc.artist_id FROM crm.ad_platform_connections pc WHERE pc.id = x.connection_id),'traffic_write',NULL);
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'campanha não encontrada ou sem permissão' USING ERRCODE='42501'; END IF;
  RETURN v_n;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_sync_status(p_artist_id uuid)
 RETURNS TABLE(platform text, escopo text, last_sync_at timestamp with time zone, cadencia text, cadencia_minutos integer, atrasado boolean, last_error text, connection_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
-- D-ERP155: só plataformas com ligação de anúncios do artista; horas por ligação.
-- D-ERP178: TikTok passa a uma linha POR LIGAÇÃO (sync por API; manual como fallback).
-- D-ERP258: connection_id nas linhas TikTok (NULL nas agregadas).
DECLARE
  v_meta_ids uuid[]; v_google_ids uuid[];
  v_meta timestamptz; v_meta_err text; v_google timestamptz; v_rec timestamptz;
  t record; v_api timestamptz; v_api_err text; v_man timestamptz;
BEGIN
  PERFORM public.artist_access_check(p_artist_id,'read','traffic');

  SELECT array_agg(c.id) FILTER (WHERE c.platform = 'meta' AND c.status = 'active'),
         array_agg(c.id) FILTER (WHERE c.platform = 'google' AND c.status = 'active')
    INTO v_meta_ids, v_google_ids
    FROM crm.ad_platform_connections c
   WHERE c.artist_id = p_artist_id AND c.connection_scope = 'artist';

  IF v_meta_ids IS NOT NULL THEN
    SELECT max(s.last_sync_at) INTO v_meta FROM crm.meta_sync_state s WHERE s.connection_id = ANY(v_meta_ids);
    SELECT s.last_error INTO v_meta_err FROM crm.meta_sync_state s
     WHERE s.connection_id = ANY(v_meta_ids) AND s.last_error IS NOT NULL
     ORDER BY s.last_error_at DESC NULLS LAST LIMIT 1;
  END IF;

  IF v_google_ids IS NOT NULL THEN
    SELECT greatest(
      (SELECT max(gc.last_synced_at) FROM crm.google_campaign gc WHERE gc.connection_id = ANY(v_google_ids)),
      (SELECT max(r.finished_at) FROM public.sync_runs r
        WHERE r.function_name IN ('crm-google-sync-campaigns','crm-google-video-metrics-sync')
          AND NOT r.dry_run AND r.status IN ('success','partial')
          AND EXISTS (SELECT 1 FROM unnest(v_google_ids) g WHERE r.details->'per_connection' ? g::text))
    ) INTO v_google;
  END IF;

  IF v_meta_ids IS NOT NULL OR v_google_ids IS NOT NULL THEN
    SELECT max(r.finished_at) INTO v_rec FROM public.sync_runs r
     WHERE r.function_name IN ('crm-meta-sync-insights:breakdowns','crm-google-sync-campaigns:breakdowns')
       AND NOT r.dry_run
       AND EXISTS (SELECT 1 FROM unnest(coalesce(v_meta_ids,'{}') || coalesce(v_google_ids,'{}')) x
                    WHERE r.details->'per_connection' ? x::text OR r.details->'params'->>'connection_id' = x::text);
  END IF;

  IF v_meta_ids IS NOT NULL THEN
    RETURN QUERY SELECT 'meta'::text, 'campanhas e resultados'::text, v_meta, 'de hora a hora'::text, 60,
      (v_meta IS NULL OR v_meta < now() - interval '120 minutes'), v_meta_err, NULL::uuid;
  END IF;
  IF v_google_ids IS NOT NULL THEN
    RETURN QUERY SELECT 'google'::text, 'campanhas e vídeo'::text, v_google, 'de 3 em 3 horas'::text, 180,
      (v_google IS NULL OR v_google < now() - interval '360 minutes'), NULL::text, NULL::uuid;
  END IF;
  IF v_meta_ids IS NOT NULL OR v_google_ids IS NOT NULL THEN
    RETURN QUERY SELECT 'recortes'::text, 'região, idade e género'::text, v_rec, '1x por dia'::text, 1440,
      (v_rec IS NULL OR v_rec < now() - interval '2880 minutes'), NULL::text, NULL::uuid;
  END IF;

  FOR t IN SELECT c.id, c.status, c.selected_ad_account_currency AS cur, c.selected_ad_account_id AS acc
             FROM crm.ad_platform_connections c
            WHERE c.artist_id = p_artist_id AND c.connection_scope = 'artist' AND c.platform = 'tiktok'
              AND c.status IN ('active','pending_link','error')
            ORDER BY c.connected_at NULLS LAST, c.id LOOP
    v_api := NULL; v_api_err := NULL; v_man := NULL;
    SELECT max(r.finished_at) INTO v_api FROM public.sync_runs r
     WHERE r.function_name = 'artist-ads-tiktok-sync' AND NOT r.dry_run
       AND (r.details->'per_connection'->t.id::text->>'ok')::boolean IS TRUE;
    SELECT r.details->'per_connection'->t.id::text->>'error' INTO v_api_err FROM public.sync_runs r
     WHERE r.function_name = 'artist-ads-tiktok-sync' AND NOT r.dry_run AND r.details->'per_connection' ? t.id::text
     ORDER BY r.started_at DESC LIMIT 1;
    IF v_api IS NOT NULL OR v_api_err IS NOT NULL THEN
      RETURN QUERY SELECT 'tiktok'::text, ('campanhas e resultados (' || coalesce(t.cur,'?') || ')')::text, v_api,
        '3x por dia (API)'::text, 360, (v_api IS NULL OR v_api < now() - interval '720 minutes'), v_api_err, t.id;
    ELSE
      SELECT max(i.recorded_at) INTO v_man FROM crm.tiktok_insights_daily i WHERE i.connection_id = t.id AND i.source = 'manual';
      IF v_man IS NOT NULL THEN
        RETURN QUERY SELECT 'tiktok'::text, ('registo manual (' || coalesce(t.cur,'?') || ')')::text, v_man, 'manual'::text, NULL::integer, false, NULL::text, t.id;
      END IF;
    END IF;
  END LOOP;
END; $function$
;

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
  v_company := public.artist_access_check(p_artist_id,'traffic_write',NULL);
  IF v_uid IS NOT NULL AND NOT public.user_has_company_access(v_company, ARRAY['admin','manager','marketing_manager']::public.app_role[]) THEN
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
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_ads_unlinked_summary(p_artist_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
BEGIN
  PERFORM public.artist_access_check(p_artist_id,'read','traffic');
  RETURN public.artist_ads_unlinked_summary__impl(p_artist_id);
END; $function$
;

CREATE OR REPLACE FUNCTION public.artist_content_set_song(p_content_id uuid, p_song_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'confirmed'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old record;
  v_song_id uuid;
BEGIN
  IF p_status NOT IN ('none','estimated','confirmed','rejected') THEN
    RAISE EXCEPTION 'estado inválido: %', p_status;
  END IF;

  SELECT id, artist_id, company_id, song_id, song_link_status, song_link_reason
    INTO v_old
    FROM public.artist_content
   WHERE id = p_content_id;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'vídeo não encontrado';
  END IF;
  -- D-ERP168: papel na empresa do vídeo (não na empresa ativa).
  IF NOT public.artist_access_ok(v_old.artist_id,'traffic_write',NULL) THEN
    RAISE EXCEPTION 'sem permissão para alterar a ligação vídeo→música';
  END IF;

  IF p_status IN ('rejected','none') THEN
    v_song_id := NULL;
  ELSE
    v_song_id := COALESCE(p_song_id, v_old.song_id);
    IF v_song_id IS NULL THEN
      RAISE EXCEPTION 'estado % exige uma música', p_status;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.artist_songs s
       WHERE s.id = v_song_id AND s.artist_id = v_old.artist_id
    ) THEN
      RAISE EXCEPTION 'a música não pertence a este artista';
    END IF;
  END IF;

  UPDATE public.artist_content
     SET song_id = v_song_id,
         song_link_status = p_status,
         song_link_reason = CASE
           WHEN p_status = 'confirmed' THEN 'confirmado manualmente'
           WHEN p_status = 'rejected' THEN 'rejeitado manualmente'
           WHEN p_status = 'none' THEN NULL
           ELSE song_link_reason
         END,
         updated_at = now()
   WHERE id = p_content_id;

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, metadata)
  VALUES ('artist_content', p_content_id::text, 'set_song',
          COALESCE(auth.uid()::text, 'service_role'),
          jsonb_build_object(
            'old_song_id', v_old.song_id,
            'old_status', v_old.song_link_status,
            'new_song_id', v_song_id,
            'new_status', p_status
          ));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.artist_dashboard(p_artist_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm', 'pg_catalog'
AS $function$
declare
  v_company uuid;
  v_nome text;
  v_song_id uuid;
  v_song_title text;
  v_song_release date;
  v_redes jsonb := '[]'::jsonb;
  v_canais jsonb := '[]'::jsonb;
  v_musica jsonb := '{}'::jsonb;
  v_camp jsonb := '{}'::jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_days integer := greatest(1, (current_date - p_from) + 1);
begin
  -- pertença: mesmo padrão das RPCs artist_ads_* (service_role passa; sessão sem papel recusa)
  v_company := public.artist_access_check(p_artist_id,'read','overview');

  select a.name into v_nome from public.artists a where a.id = p_artist_id;

  -- música de trabalho: artist_songs não tem is_working_single; a flag real é is_launch
  select s.id, s.title, s.release_date
    into v_song_id, v_song_title, v_song_release
  from public.artist_songs s
  where s.artist_id = p_artist_id
  order by (s.is_launch is true) desc,
           coalesce(s.launch_started_at, s.release_date) desc nulls last,
           s.release_date desc nulls last
  limit 1;

  with want(grupo, platform, metric) as (
    values
      ('redes','instagram','followers'),
      ('redes','instagram','reach'),
      ('redes','instagram','total_interactions'),
      ('redes','instagram','views'),
      -- D-ERP165 adenda: kpis diários (tipo dia_fechado)
      ('redes','instagram','accounts_engaged'),
      ('redes','instagram','profile_links_taps'),
      ('redes','instagram','followers_gained'),
      ('redes','instagram','followers_lost'),
      ('redes','youtube','yt_views_day'),
      ('redes','youtube','yt_minutes_watched_day'),
      ('redes','youtube','yt_subscribers_gained_day'),
      ('redes','youtube','yt_subscribers_lost_day'),
      ('redes','tiktok','followers'),
      ('redes','tiktok','likes'),
      ('redes','tiktok','video_count'),
      ('redes','youtube','subscribers'),
      ('redes','facebook','followers'),
      ('canais','spotify','monthly_listeners'),
      ('canais','sua_musica','plays_total'),
      ('canais','sua_musica','downloads_total'),
      ('canais','sua_musica','uploads'),
      ('canais','deezer','fans'),
      ('canais','apple_music','followers')
  ),
  base as (
    select w.grupo, m.platform, m.metric, m.source, m.metric_date, m.value
    from want w
    join public.artist_metrics_daily m
      on m.platform = w.platform and m.metric = w.metric
     and m.artist_id = p_artist_id
    where m.metric_date <= p_to and m.value is not null
    union all
    select 'canais', 'spotify', 'catalog_streams', 'aggregator', sm.metric_date, sum(sm.value)
    from public.artist_song_metrics_daily sm
    where sm.artist_id = p_artist_id and sm.platform = 'spotify'
      and sm.metric = 'streams' and sm.metric_date <= p_to and sm.value is not null
    group by sm.metric_date
    union all
    select 'canais', 'youtube', 'catalog_views', 'aggregator', sm.metric_date, sum(sm.value)
    from public.artist_song_metrics_daily sm
    where sm.artist_id = p_artist_id and sm.platform = 'youtube'
      and sm.metric in ('views','video_views') and sm.metric_date <= p_to and sm.value is not null
    group by sm.metric_date
  ),
  src as (
    select grupo, platform, metric,
      case when bool_or(source = 'platform_api') then 'platform_api'
           else (array_agg(source order by metric_date desc))[1] end as source
    from base group by 1,2,3
  ),
  f as (
    select b.* from base b join src s
      on s.grupo = b.grupo and s.platform = b.platform and s.metric = b.metric
     and s.source = b.source
  ),
  cur as (
    select distinct on (grupo, platform, metric)
      grupo, platform, metric, source, value, metric_date
    from f order by grupo, platform, metric, metric_date desc
  ),
  prev as (
    select distinct on (grupo, platform, metric)
      grupo, platform, metric, value
    from f where metric_date <= p_from
    order by grupo, platform, metric, metric_date desc
  ),
  serie as (
    select grupo, platform, metric,
      jsonb_agg(jsonb_build_object('d', metric_date, 'v', value) order by metric_date) s
    from f where metric_date between p_from and p_to
    group by 1,2,3
  ),
  -- D-ERP165: métricas que são o total de UM dia comparam médias de 7 dias fechados.
  tipo as (
    select c.grupo, c.platform, c.metric,
      case when (c.platform = 'instagram' and c.metric in
                  ('reach','views','total_interactions','accounts_engaged',
                   'profile_links_taps','followers_gained','followers_lost'))
             or c.metric like '%\_day'
           then 'dia_fechado' else 'instantaneo' end as tipo
    from cur c
  ),
  fim as (
    select t.grupo, t.platform, t.metric,
      (select max(x.metric_date) from f x
        where x.grupo = t.grupo and x.platform = t.platform and x.metric = t.metric
          and x.metric_date <= least(p_to, current_date - 1)) as ate
    from tipo t where t.tipo = 'dia_fechado'
  ),
  medias as (
    select e.grupo, e.platform, e.metric, e.ate,
      avg(x.value) filter (where x.metric_date between e.ate - 6 and e.ate) as m_atual,
      count(x.value) filter (where x.metric_date between e.ate - 6 and e.ate) as n_atual,
      avg(x.value) filter (where x.metric_date between e.ate - 13 and e.ate - 7) as m_ant,
      count(x.value) filter (where x.metric_date between e.ate - 13 and e.ate - 7) as n_ant
    from fim e
    left join f x on x.grupo = e.grupo and x.platform = e.platform and x.metric = e.metric
     and x.metric_date between e.ate - 13 and e.ate
    group by 1,2,3,4
  ),
  out as (
    select c.grupo, c.platform, c.metric, c.source, c.metric_date as as_of, t.tipo,
      case when t.tipo = 'dia_fechado' then round(md.m_atual, 2)
           when c.metric_date >= p_from then c.value end as atual,
      case when t.tipo = 'dia_fechado' then round(md.m_ant, 2) else p.value end as anterior,
      (c.metric_date < p_from) as parado,
      case when t.tipo = 'dia_fechado' then jsonb_build_object(
        'janela_atual', jsonb_build_object('de', md.ate - 6, 'ate', md.ate, 'dias_com_dados', coalesce(md.n_atual,0)),
        'janela_anterior', jsonb_build_object('de', md.ate - 13, 'ate', md.ate - 7, 'dias_com_dados', coalesce(md.n_ant,0)),
        'ultimo_dia', jsonb_build_object('valor', c.value, 'data', c.metric_date))
      else '{}'::jsonb end as extra,
      coalesce(sr.s, '[]'::jsonb) as serie
    from cur c
    join tipo t on t.grupo = c.grupo and t.platform = c.platform and t.metric = c.metric
    left join medias md on md.grupo = c.grupo and md.platform = c.platform and md.metric = c.metric
    left join prev p on p.grupo = c.grupo and p.platform = c.platform and p.metric = c.metric
    left join serie sr on sr.grupo = c.grupo and sr.platform = c.platform and sr.metric = c.metric
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'platform', platform, 'metric', metric,
      'atual', atual, 'anterior', anterior,
      'delta', case when atual is not null and anterior is not null then atual - anterior end,
      'delta_pct', case when atual is not null and coalesce(anterior,0) <> 0
                       then round(((atual - anterior) / anterior) * 100, 2) end,
      'as_of', as_of, 'source', source, 'serie', serie, 'tipo', tipo
    ) || extra order by platform, metric) filter (where grupo = 'redes'), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'platform', platform, 'metric', metric,
      'atual', atual, 'anterior', anterior,
      'delta', case when atual is not null and anterior is not null then atual - anterior end,
      'delta_pct', case when atual is not null and coalesce(anterior,0) <> 0
                       then round(((atual - anterior) / anterior) * 100, 2) end,
      'as_of', as_of, 'source', source, 'serie', serie, 'tipo', tipo
    ) || extra order by platform, metric) filter (where grupo = 'canais'), '[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(
        public.artist_dashboard_platform_label(platform) || ' sem dado desde ' ||
        to_char(as_of, 'DD/MM')
      ) order by platform, metric) filter (where atual is null or parado), '[]'::jsonb)
  into v_redes, v_canais, v_avisos
  from out;

  if v_song_id is not null then
    with want(metric) as (values ('streams'), ('ugc_videos'), ('ugc_videos_sounds')),
    base as (
      select sm.metric, sm.source, sm.source_ref, sm.metric_date, sm.value
      from public.artist_song_metrics_daily sm
      join want w on w.metric = sm.metric
      where sm.song_id = v_song_id and sm.metric_date <= p_to and sm.value is not null
        and (sm.metric <> 'streams' or sm.platform = 'spotify')
        -- ugc_videos: só atalho iOS ou manual; tiktok_artists vive em musica.ttfa
        and (sm.metric <> 'ugc_videos' or sm.source in ('ios_shortcut','manual'))
    ),
    src as (
      select metric,
        case
          when metric = 'ugc_videos' then
            case when bool_or(source = 'ios_shortcut') then 'ios_shortcut' else 'manual' end
          when bool_or(source = 'platform_api') then 'platform_api'
          else (array_agg(source order by metric_date desc))[1]
        end as source
      from base group by 1
    ),
    f as (select b.* from base b join src s on s.metric = b.metric and s.source = b.source),
    cur as (
      select distinct on (metric) metric, source, source_ref, value, metric_date
      from f order by metric, metric_date desc
    ),
    prev as (
      select distinct on (metric) metric, value from f
      where metric_date <= p_from order by metric, metric_date desc
    ),
    serie as (
      select metric, jsonb_agg(jsonb_build_object('d', metric_date, 'v', value) order by metric_date) s
      from f where metric_date between p_from and p_to group by 1
    ),
    out as (
      select c.metric, c.source, c.metric_date as as_of,
        case when c.metric_date >= p_from then c.value end as atual,
        p.value as anterior,
        coalesce(sr.s, '[]'::jsonb) as serie,
        case when c.metric = 'ugc_videos' then c.source
             else substring(c.source_ref from 'precis[ãa]o:\s*([^;]+)') end as precisao
      from cur c
      left join prev p on p.metric = c.metric
      left join serie sr on sr.metric = c.metric
    ),
    j as (
      select metric, jsonb_build_object(
        'atual', atual, 'anterior', anterior,
        'delta', case when atual is not null and anterior is not null then atual - anterior end,
        'delta_pct', case when atual is not null and coalesce(anterior,0) <> 0
                         then round(((atual - anterior) / anterior) * 100, 2) end,
        'as_of', as_of, 'source', source, 'precisao', precisao, 'serie', serie
      ) as obj,
      case when atual is null then
        (case metric when 'streams' then 'Spotify (música de trabalho)'
                     when 'ugc_videos' then 'UGC TikTok'
                     else 'UGC sons TikTok' end)
        || ' sem dado desde ' || to_char(as_of, 'DD/MM') end as aviso
      from out
    )
    select
      jsonb_build_object(
        'streams',           coalesce((select obj from j where metric = 'streams'), 'null'::jsonb),
        'ugc_videos',        coalesce((select obj from j where metric = 'ugc_videos'), 'null'::jsonb),
        'ugc_videos_sounds', coalesce((select obj from j where metric = 'ugc_videos_sounds'), 'null'::jsonb)
      ),
      v_avisos || coalesce((select jsonb_agg(to_jsonb(aviso)) from j where aviso is not null), '[]'::jsonb)
    into v_musica, v_avisos;

    v_musica := v_musica || jsonb_build_object('ttfa', (
      select jsonb_build_object(
        'criadores', max(value) filter (where metric = 'ugc_creators'),
        'views',     max(value) filter (where metric = 'ugc_views'),
        'as_of',     max(metric_date)
      )
      from public.artist_song_metrics_daily
      where song_id = v_song_id and source = 'tiktok_artists'
        and metric in ('ugc_creators','ugc_views') and metric_date <= p_to
        and metric_date = (
          select max(metric_date) from public.artist_song_metrics_daily x
          where x.song_id = v_song_id and x.source = 'tiktok_artists' and x.metric_date <= p_to
        )
    ));

    v_musica := v_musica || jsonb_build_object('benchmark', (
      with b as (
        select song_id, is_self, spotify_streams_dia_n, spotify_streams_dia_n_date,
               rank() over (order by spotify_streams_dia_n desc nulls last) as pos,
               count(*) over () as total
        from public.v_song_benchmark_aligned
        where launch_song_id = v_song_id
      )
      select jsonb_build_object('posicao', pos, 'total', total, 'as_of', spotify_streams_dia_n_date)
      from b where is_self limit 1
    ));

    v_musica := v_musica || jsonb_build_object('relatorio_em', (
      select max(generated_at) from public.artist_song_reports
      where song_id = v_song_id and status = 'ok'
    ));
  else
    v_musica := jsonb_build_object('streams', null, 'ugc_videos', null,
      'ugc_videos_sounds', null, 'ttfa', null, 'benchmark', null, 'relatorio_em', null);
    v_avisos := v_avisos || to_jsonb('Artista sem música de trabalho definida'::text);
  end if;

  with d as (
    select * from public.artist_ads_daily(p_artist_id, v_days) x
    where x.day between p_from and p_to
  ),
  por as (
    select platform,
      sum(spend) as gasto, sum(impressions) as impressoes,
      sum(results) as resultados, sum(video_views) as video_views,
      (array_agg(currency order by day desc))[1] as moeda
    from d group by platform
  ),
  serie as (
    select platform, jsonb_agg(jsonb_build_object(
        'd', day, 'gasto', gasto, 'impressoes', impressoes, 'resultados', resultados
      ) order by day) s
    from (
      select platform, day, sum(spend) gasto, sum(impressions) impressoes, sum(results) resultados
      from d group by platform, day
    ) t group by platform
  )
  select jsonb_build_object(
    'por_plataforma', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', p.platform, 'gasto', p.gasto, 'impressoes', p.impressoes,
        'resultados', p.resultados,
        'tipo_resultado', case when coalesce(p.resultados,0) > 0 then 'resultados'
                               when coalesce(p.video_views,0) > 0 then 'visualizacoes' end,
        'cpm', case when coalesce(p.impressoes,0) > 0 then round(p.gasto / p.impressoes * 1000, 4) end,
        'cpv', case when coalesce(p.video_views,0) > 0 then round(p.gasto / p.video_views, 4) end,
        'alcance', null, 'moeda', p.moeda,
        'serie', coalesce(sr.s, '[]'::jsonb)
      ) order by p.platform)
      from por p left join serie sr on sr.platform = p.platform), '[]'::jsonb),
    'ativas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', c.platform, 'campaign_id', c.campaign_id, 'nome', c.campaign_name,
        'estado', c.status, 'orcamento_dia', c.budget_daily,
        'gasto_periodo', (select sum(x.spend) from d x
                           where x.platform = c.platform and x.campaign_id = c.campaign_id)
      ) order by c.platform, c.campaign_name)
      from public.artist_ads_campaigns(p_artist_id, false) c
      where c.status = 'ACTIVE'), '[]'::jsonb),
    'tetos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', t.platform, 'teto_dia', t.daily_cap, 'comprometido', t.committed_daily
      ) order by t.platform)
      from public.artist_ads_budget_cap_get(p_artist_id) t
      where t.has_cap), '[]'::jsonb)
  ) into v_camp;

  return jsonb_build_object(
    'periodo', jsonb_build_object('from', p_from, 'to', p_to),
    'artista', jsonb_build_object('id', p_artist_id, 'nome', v_nome,
      'musica_trabalho', case when v_song_id is null then null else jsonb_build_object(
        'song_id', v_song_id, 'titulo', v_song_title, 'lancamento', v_song_release,
        'dias', case when v_song_release is null then null else (p_to - v_song_release) end
      ) end),
    'redes', v_redes,
    'canais', v_canais,
    'musica', v_musica,
    'campanhas', v_camp,
    'avisos', v_avisos
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.artist_growth_summary_rows()
 RETURNS TABLE(company_id uuid, artist_id uuid, artist_name text, platform text, metric text, latest_date date, latest_value numeric, d7_base_date date, d7_delta numeric, d7_pct numeric, d30_base_date date, d30_delta numeric, d30_pct numeric, d90_base_date date, d90_delta numeric, d90_pct numeric, accel_pct numeric, best_date date, best_value numeric, worst_date date, worst_value numeric, precisao numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH comp AS (SELECT DISTINCT a.company_id AS id FROM public.artists a WHERE a.id IN (SELECT public.artist_readable_ids())),
latest AS (
  SELECT DISTINCT ON (m.artist_id, m.platform, m.metric) m.company_id, m.artist_id, m.platform, m.metric,
    m.metric_date AS latest_date, m.value AS latest_value, m.source_ref AS latest_source_ref
  FROM public.artist_metrics_daily m JOIN comp ON comp.id = m.company_id AND m.artist_id IN (SELECT public.artist_readable_ids())
  ORDER BY m.artist_id, m.platform, m.metric, m.metric_date DESC,
    (CASE m.source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END)
), pts AS (
  SELECT l.company_id, l.artist_id, l.platform, l.metric, l.latest_date, l.latest_value, l.latest_source_ref, a.name AS artist_name,
    p7.value AS v7, p7.metric_date AS d7_date, p30.value AS v30, p30.metric_date AS d30_date,
    p60.value AS v60, p60.metric_date AS d60_date, p90.value AS v90, p90.metric_date AS d90_date
  FROM latest l
  JOIN public.artists a ON a.id = l.artist_id
  LEFT JOIN LATERAL (SELECT s.metric_date, s.value FROM public.artist_metrics_daily s
    WHERE s.artist_id=l.artist_id AND s.platform=l.platform AND s.metric=l.metric AND s.metric_date >= l.latest_date-12 AND s.metric_date <= l.latest_date-2
    ORDER BY abs(s.metric_date-(l.latest_date-7)) LIMIT 1) p7 ON true
  LEFT JOIN LATERAL (SELECT s.metric_date, s.value FROM public.artist_metrics_daily s
    WHERE s.artist_id=l.artist_id AND s.platform=l.platform AND s.metric=l.metric AND s.metric_date >= l.latest_date-35 AND s.metric_date <= l.latest_date-25
    ORDER BY abs(s.metric_date-(l.latest_date-30)) LIMIT 1) p30 ON true
  LEFT JOIN LATERAL (SELECT s.metric_date, s.value FROM public.artist_metrics_daily s
    WHERE s.artist_id=l.artist_id AND s.platform=l.platform AND s.metric=l.metric AND s.metric_date >= l.latest_date-65 AND s.metric_date <= l.latest_date-55
    ORDER BY abs(s.metric_date-(l.latest_date-60)) LIMIT 1) p60 ON true
  LEFT JOIN LATERAL (SELECT s.metric_date, s.value FROM public.artist_metrics_daily s
    WHERE s.artist_id=l.artist_id AND s.platform=l.platform AND s.metric=l.metric AND s.metric_date >= l.latest_date-95 AND s.metric_date <= l.latest_date-85
    ORDER BY abs(s.metric_date-(l.latest_date-90)) LIMIT 1) p90 ON true
), extremes AS (
  SELECT p_1.artist_id, p_1.platform, p_1.metric,
    (SELECT s.metric_date FROM public.artist_metrics_daily s WHERE s.artist_id=p_1.artist_id AND s.platform=p_1.platform AND s.metric=p_1.metric AND s.metric_date > p_1.latest_date-365 ORDER BY s.value DESC, s.metric_date LIMIT 1) AS best_date,
    (SELECT max(s.value) FROM public.artist_metrics_daily s WHERE s.artist_id=p_1.artist_id AND s.platform=p_1.platform AND s.metric=p_1.metric AND s.metric_date > p_1.latest_date-365) AS best_value,
    (SELECT s.metric_date FROM public.artist_metrics_daily s WHERE s.artist_id=p_1.artist_id AND s.platform=p_1.platform AND s.metric=p_1.metric AND s.metric_date > p_1.latest_date-365 ORDER BY s.value, s.metric_date LIMIT 1) AS worst_date,
    (SELECT min(s.value) FROM public.artist_metrics_daily s WHERE s.artist_id=p_1.artist_id AND s.platform=p_1.platform AND s.metric=p_1.metric AND s.metric_date > p_1.latest_date-365) AS worst_value
  FROM pts p_1
)
SELECT p.company_id, p.artist_id, p.artist_name, p.platform, p.metric, p.latest_date, p.latest_value,
  p.d7_date, CASE WHEN p.v7 IS NULL THEN NULL::numeric ELSE p.latest_value-p.v7 END,
  CASE WHEN p.v7 IS NULL OR p.v7=0 THEN NULL::numeric ELSE round((p.latest_value-p.v7)/p.v7*100,2) END,
  p.d30_date, CASE WHEN p.v30 IS NULL THEN NULL::numeric ELSE p.latest_value-p.v30 END,
  CASE WHEN p.v30 IS NULL OR p.v30=0 THEN NULL::numeric ELSE round((p.latest_value-p.v30)/p.v30*100,2) END,
  p.d90_date, CASE WHEN p.v90 IS NULL THEN NULL::numeric ELSE p.latest_value-p.v90 END,
  CASE WHEN p.v90 IS NULL OR p.v90=0 THEN NULL::numeric ELSE round((p.latest_value-p.v90)/p.v90*100,2) END,
  CASE WHEN p.v30 IS NULL OR p.v60 IS NULL OR p.v30=0 OR p.v60=0 THEN NULL::numeric
       ELSE round((p.latest_value-p.v30)/p.v30*100 - (p.v30-p.v60)/p.v60*100, 2) END,
  e.best_date, e.best_value, e.worst_date, e.worst_value,
  public._artist_metric_precisao(p.artist_id, p.platform, p.metric, p.latest_date, p.latest_value, p.latest_source_ref)
FROM pts p JOIN extremes e ON e.artist_id=p.artist_id AND e.platform=p.platform AND e.metric=p.metric
$function$
;

CREATE OR REPLACE FUNCTION public.artist_momentum_rows()
 RETURNS TABLE(company_id uuid, artist_id uuid, artist_name text, roster_type text, platform text, metric text, latest_date date, latest_value numeric, d7_pct numeric, d30_pct numeric, d90_pct numeric, momentum_index numeric, precisao numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH comp AS (SELECT DISTINCT a.company_id AS id FROM public.artists a WHERE a.id IN (SELECT public.artist_readable_ids())),
mains(platform, metric) AS (VALUES ('spotify','monthly_listeners'),('instagram','followers'),('tiktok','followers'),('youtube','subscribers')),
lat AS (
  SELECT DISTINCT ON (m.artist_id, m.platform, m.metric) m.company_id, m.artist_id, m.platform, m.metric, m.metric_date, m.value, m.source_ref
  FROM public.artist_metrics_daily m JOIN comp ON comp.id = m.company_id AND m.artist_id IN (SELECT public.artist_readable_ids()) JOIN mains mm ON mm.platform=m.platform AND mm.metric=m.metric
  ORDER BY m.artist_id, m.platform, m.metric, m.metric_date DESC,
    CASE m.source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END, m.captured_at DESC NULLS LAST
), g AS (
  SELECT l.*, a.name AS artist_name, a.roster_type,
    public._artist_metric_pct_near(l.artist_id, l.platform, l.metric, l.metric_date, l.value, 7, 2, 12) d7,
    public._artist_metric_pct_near(l.artist_id, l.platform, l.metric, l.metric_date, l.value, 30, 25, 35) d30,
    public._artist_metric_pct_near(l.artist_id, l.platform, l.metric, l.metric_date, l.value, 90, 85, 95) d90
  FROM lat l JOIN public.artists a ON a.id = l.artist_id
)
SELECT company_id, artist_id, artist_name, roster_type, platform, metric, metric_date AS latest_date, value AS latest_value,
  d7 AS d7_pct, d30 AS d30_pct, d90 AS d90_pct,
  public._artist_metric_momentum(d7, d30, d90) AS momentum_index,
  public._artist_metric_precisao(g.artist_id, g.platform, g.metric, g.metric_date, g.value, g.source_ref) AS precisao
FROM g
$function$
;

CREATE OR REPLACE FUNCTION public.artist_readable_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id FROM public.artists a
  WHERE public.has_role(auth.uid(),'platform_admin'::app_role)
     OR EXISTS (SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = auth.uid() AND ur.company_id = a.company_id AND ur.role <> 'user')
     OR EXISTS (SELECT 1 FROM public.artist_user_access x
                WHERE x.user_id = auth.uid() AND x.artist_id = a.id AND x.revoked_at IS NULL)
$function$
;

CREATE OR REPLACE FUNCTION public.artist_song_link_list(p_artist_id uuid)
 RETURNS SETOF song_links
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := public.artist_access_check(p_artist_id,'traffic_write',NULL);
  RETURN QUERY
    SELECT * FROM public.song_links
    WHERE artist_id = p_artist_id AND company_id = v_company
    ORDER BY created_at DESC;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_song_link_stats(p_artist_id uuid, p_from date, p_to date)
 RETURNS TABLE(dia date, link_id uuid, slug text, song_id uuid, utm_campaign text, utm_content text, chegadas bigint, escolhas bigint, escolhas_por_destino jsonb, aberturas_app bigint, aberturas_web bigint, campanha_id text, campanha_nome text, gasto_campanha_dia numeric, moeda text, custo_por_chegada numeric, canal text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  WITH guard AS (SELECT public.artist_access_check(p_artist_id,'read','songs') AS company_id),
  ev AS (
    SELECT e.link_id, e.event, e.opened, coalesce(e.destination,'(sem)') AS destination,
      coalesce(e.utm_campaign,'') AS utm_campaign, coalesce(e.utm_content,'') AS utm_content,
      (e.created_at AT TIME ZONE 'Europe/Lisbon')::date AS dia,
      public.song_link_event_canal(sl.canal, e.utm_source, e.utm_medium, e.utm_campaign) AS canal
    FROM public.song_link_events e JOIN public.song_links sl ON sl.id = e.link_id, guard g
    WHERE e.artist_id = p_artist_id AND e.company_id = g.company_id
      AND e.created_at >= (p_from::timestamp AT TIME ZONE 'Europe/Lisbon')
      AND e.created_at <  ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Lisbon')
  ),
  base AS (
    SELECT dia, link_id, utm_campaign, utm_content, canal,
      count(*) FILTER (WHERE event = 'arrival') AS chegadas,
      count(*) FILTER (WHERE event = 'choice')  AS escolhas,
      count(*) FILTER (WHERE opened = 'app')    AS aberturas_app,
      count(*) FILTER (WHERE opened = 'web')    AS aberturas_web
    FROM ev GROUP BY 1,2,3,4,5
  ),
  dest AS (
    SELECT dia, link_id, utm_campaign, utm_content, canal, jsonb_object_agg(destination, n) AS d
    FROM (SELECT dia, link_id, utm_campaign, utm_content, canal, destination, count(*) AS n
          FROM ev WHERE event = 'choice' GROUP BY 1,2,3,4,5,6) x
    GROUP BY 1,2,3,4,5
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
    CASE WHEN s.gasto IS NOT NULL AND t.n > 0 THEN round(s.gasto / t.n, 4) END,
    b.canal
  FROM base b
  JOIN public.song_links l ON l.id = b.link_id
  LEFT JOIN dest d ON d.dia = b.dia AND d.link_id = b.link_id
                  AND d.utm_campaign = b.utm_campaign AND d.utm_content = b.utm_content AND d.canal = b.canal
  LEFT JOIN camp cm ON b.utm_campaign <> '' AND cm.cslug = b.utm_campaign
  LEFT JOIN spend s ON s.connection_id = cm.connection_id
                   AND s.external_campaign_id = cm.external_campaign_id AND s.date_start = b.dia
  LEFT JOIN tot t ON t.dia = b.dia AND t.utm_campaign = b.utm_campaign
  ORDER BY b.dia DESC, b.chegadas DESC
$function$
;

CREATE OR REPLACE FUNCTION public.artist_song_link_upsert(p_song_id uuid, p_slug text, p_default_mode text, p_title text DEFAULT NULL::text, p_cover_url text DEFAULT NULL::text, p_destinations jsonb DEFAULT '{}'::jsonb, p_meta_pixel_id text DEFAULT NULL::text, p_active boolean DEFAULT true, p_canal text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_artist uuid; v_company uuid; v_slug text; v_ex public.song_links; v_id uuid;
BEGIN
  SELECT artist_id INTO v_artist FROM public.artist_songs WHERE id = p_song_id;
  IF v_artist IS NULL THEN
    RAISE EXCEPTION 'música inexistente' USING ERRCODE = '22023';
  END IF;
  v_company := public.artist_access_check(v_artist,'traffic_write',NULL);

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
      active = coalesce(p_active, true), canal = nullif(btrim(p_canal),'')
    WHERE id = v_ex.id RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.song_links (company_id, artist_id, song_id, slug, default_mode, title,
      cover_url, destinations, meta_pixel_id, active, created_by, canal)
    VALUES (v_company, v_artist, p_song_id, v_slug, p_default_mode, p_title, p_cover_url,
      p_destinations, nullif(btrim(p_meta_pixel_id),''), coalesce(p_active, true), auth.uid(), nullif(btrim(p_canal),''))
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.artist_song_metric_set_manual(p_song_id uuid, p_platform text, p_metric text, p_metric_date date, p_value numeric, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_song record;
  v_old numeric;
  v_existe boolean;
BEGIN
  IF p_platform NOT IN ('tiktok','instagram','youtube','spotify','deezer','apple-music','other') THEN
    RAISE EXCEPTION 'plataforma inválida: %', p_platform;
  END IF;
  IF p_value IS NULL OR p_value < 0 THEN RAISE EXCEPTION 'valor inválido'; END IF;
  SELECT id, artist_id, company_id INTO v_song FROM public.artist_songs WHERE id = p_song_id;
  IF v_song.id IS NULL THEN RAISE EXCEPTION 'música não encontrada'; END IF;
  -- D-ERP168: papel na empresa da música (não na empresa ativa).
  IF NOT public.artist_access_ok(v_song.artist_id,'traffic_write',NULL) THEN
    RAISE EXCEPTION 'sem permissão para registar métricas manuais';
  END IF;

  SELECT value INTO v_old FROM public.artist_song_metrics_daily
   WHERE song_id = p_song_id AND platform = p_platform AND metric = p_metric
     AND metric_date = p_metric_date AND source = 'manual';
  v_existe := FOUND;

  INSERT INTO public.artist_song_metrics_daily (company_id, song_id, artist_id, platform, metric, metric_date, value, source, source_ref, captured_at)
  VALUES (v_song.company_id, p_song_id, v_song.artist_id, p_platform, p_metric, p_metric_date, p_value, 'manual',
          COALESCE(p_note, 'registo manual'), now())
  ON CONFLICT (song_id, platform, metric, metric_date, source)
  DO UPDATE SET value = EXCLUDED.value, source_ref = EXCLUDED.source_ref, captured_at = now();

  -- Relatório desactualizado só em valor NOVO ou DIFERENTE (D-ERP54 adenda).
  IF (NOT v_existe) OR v_old IS DISTINCT FROM p_value THEN
    PERFORM public.artist_song_mark_report_stale(p_song_id);
  END IF;

  INSERT INTO public.system_audit_log (company_id, entity_type, entity_id, action, changed_by, metadata)
  VALUES (v_song.company_id, 'artist_song', p_song_id::text, 'metric_manual', COALESCE(auth.uid()::text, 'service_role'),
          jsonb_build_object('platform', p_platform, 'metric', p_metric, 'date', p_metric_date, 'value', p_value, 'note', p_note));
END; $function$
;

CREATE OR REPLACE FUNCTION public.artist_top_videos_gain(p_artist_id uuid, p_dias integer, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
-- D-ERP165: "Mais vistos nos últimos N dias". Ganho = views no último dia com
-- dados − views no dia imediatamente antes do início da janela. Sem ponto de
-- partida → fora do top, mas contado em sem_ponto_partida.
declare
  v_dias int := greatest(1, coalesce(p_dias, 1));
  v_lim int := least(100, greatest(1, coalesce(p_limit, 10)));
  v_out jsonb;
begin
  perform public.artist_access_check(p_artist_id,'read','channels');

  with ult as (
    select platform, max(metric_date) as ate
    from public.artist_content_metrics_daily
    where artist_id = p_artist_id and metric = 'views' and metric_date <= current_date
    group by platform
  ),
  pts as (
    select m.content_id, m.platform, m.metric, m.metric_date, max(m.value) as value
    from public.artist_content_metrics_daily m
    join ult u on u.platform = m.platform
    where m.artist_id = p_artist_id and m.metric in ('views','likes')
      and m.metric_date between u.ate - v_dias and u.ate
    group by 1,2,3,4
  ),
  por as (
    select p.content_id, p.platform,
      (array_agg(p.value order by p.metric_date desc) filter (where p.metric = 'views' and p.metric_date > u.ate - v_dias))[1] as v_fim,
      max(p.value) filter (where p.metric = 'views' and p.metric_date = u.ate - v_dias) as v_ini,
      (array_agg(p.value order by p.metric_date desc) filter (where p.metric = 'likes' and p.metric_date > u.ate - v_dias))[1] as l_fim,
      max(p.value) filter (where p.metric = 'likes' and p.metric_date = u.ate - v_dias) as l_ini
    from pts p join ult u on u.platform = p.platform
    group by 1,2
  ),
  top as (
    select o.*, (o.v_fim - o.v_ini) as ganho
    from por o where o.v_fim is not null and o.v_ini is not null
    order by (o.v_fim - o.v_ini) desc, o.v_fim desc
    limit v_lim
  )
  select jsonb_build_object(
    'janela', jsonb_build_object(
      'de', (select max(ate) from ult) - v_dias + 1, 'ate', (select max(ate) from ult), 'dias', v_dias),
    'ultimo_dia_com_dados', coalesce((select jsonb_object_agg(platform, ate) from ult), '{}'::jsonb),
    'sem_ponto_partida', (select count(*) from por where v_fim is not null and v_ini is null),
    'videos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'content_id', t.content_id, 'platform', t.platform,
        'title', coalesce(c.title, c.caption_excerpt),
        'thumbnail', c.thumbnail_url, 'url', c.permalink, 'published_at', c.published_at,
        'views_ganhas', t.ganho, 'views_total', t.v_fim,
        'gostos_ganhos', case when t.l_fim is not null and t.l_ini is not null then t.l_fim - t.l_ini end,
        'gostos_total', t.l_fim
      ) order by t.ganho desc, t.v_fim desc)
      from top t join public.artist_content c on c.id = t.content_id), '[]'::jsonb)
  ) into v_out;
  return v_out;
end
$function$
;

CREATE OR REPLACE FUNCTION public.song_growth_summary(p_song_id uuid, p_to date DEFAULT CURRENT_DATE, p_from date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
 s record; spec record; b record; a record; v jsonb; ln jsonb; groups_out jsonb := '[]'; lines jsonb;
 kpis jsonb := '[]'; kp jsonb; series_out jsonb := '{}'; ent record;
 pct numeric; prec numeric; tol integer; days integer; lo integer; hi integer;
BEGIN
 SELECT * INTO s FROM public.artist_songs WHERE id=p_song_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'música inexistente' USING ERRCODE='P0002'; END IF;
 PERFORM public.artist_access_check(s.artist_id,'read','songs');
 IF p_from IS NULL THEN RETURN public._song_growth_summary_initial(p_song_id,p_to); END IF;
 IF p_to IS NULL OR p_to<p_from THEN RAISE EXCEPTION 'período inválido' USING ERRCODE='22023'; END IF;
 v := public._song_growth_summary_initial(p_song_id,p_to);
 -- D-ERP186: ponto mais próximo; janela de tolerância ±5 dias (7: 2–12; 30: 25–35).
 tol:=5;
 FOR spec IN
 SELECT * FROM (VALUES
 ('musica','Spotify','streams','spotify','streams','song'),
 ('video_ugc','TikTok','ugc_creators','tiktok','ugc_creators','song'),
 ('video_ugc','TikTok','ugc_views','tiktok','ugc_views','song'),
 ('video_ugc','TikTok for Artists','ugc_videos_painel','tiktok','ugc_videos','panel'),
 ('video_ugc','TikTok','ugc_videos','tiktok','ugc_videos','app'),
 ('redes','Instagram','seguidores','instagram','followers','artist'),
 ('redes','TikTok','seguidores','tiktok','followers','artist'),
 ('redes','Spotify','ouvintes_mensais','spotify','monthly_listeners','artist'),
 ('redes','YouTube','inscritos','youtube','subscribers','artist')) x(grupo,canal,indicador,platform,metric,scope)
 UNION ALL SELECT 'musica','Spotify for Artists',metric,platform,metric,'s4a' FROM public.artist_song_metrics_daily
 WHERE song_id=p_song_id AND metric LIKE 's4a\_%' AND metric NOT LIKE '%\_day%' AND metric_date<=p_to AND EXISTS (SELECT 1 FROM jsonb_array_elements(v->'grupos') g,jsonb_array_elements(g->'linhas') l WHERE l->>'indicador'=metric) GROUP BY metric,platform
 LOOP
  b:=NULL; a:=NULL; prec:=NULL;
  IF spec.scope='artist' THEN
   SELECT metric_date d,value v,source src,source_ref ref INTO a FROM public.artist_metrics_daily
    WHERE artist_id=s.artist_id AND platform=spec.platform AND metric=spec.metric AND metric_date<=p_to
    ORDER BY metric_date DESC,CASE source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END,captured_at DESC NULLS LAST LIMIT 1;
   days:=a.d-p_from; lo:=days-tol; hi:=days+tol;
   SELECT metric_date d,value v,source src,source_ref ref INTO b FROM public.artist_metrics_daily
    WHERE artist_id=s.artist_id AND platform=spec.platform AND metric=spec.metric
     AND metric_date BETWEEN p_from-tol AND least(p_to,p_from+tol)
    ORDER BY abs(metric_date-p_from),CASE source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END,captured_at DESC NULLS LAST LIMIT 1;
   -- The helper's window is capped at p_to too, matching the base selection above.
   lo:=greatest(lo,a.d-p_to);
   pct:=public._artist_metric_pct_near(s.artist_id,spec.platform,spec.metric,a.d,a.v,days,lo,hi);
   prec:=public._artist_metric_precisao(s.artist_id,spec.platform,spec.metric,a.d,a.v,a.ref);
  ELSE
   SELECT metric_date d,value v,source src,source_ref ref INTO a FROM public.artist_song_metrics_daily
    WHERE song_id=p_song_id AND platform=spec.platform AND metric=spec.metric AND metric_date<=p_to
     AND CASE spec.scope WHEN 'app' THEN source IN ('ios_shortcut','manual') WHEN 'panel' THEN source='tiktok_artists' WHEN 's4a' THEN true ELSE source=CASE WHEN spec.platform='spotify' THEN 'aggregator' ELSE 'tiktok_artists' END END
    ORDER BY metric_date DESC,CASE source WHEN 'ios_shortcut' THEN 0 WHEN 'aggregator' THEN 1 WHEN 's4a_api' THEN 1 WHEN 'manual' THEN 2 ELSE 3 END,captured_at DESC NULLS LAST LIMIT 1;
   SELECT metric_date d,value v,source src,source_ref ref INTO b FROM public.artist_song_metrics_daily
    WHERE song_id=p_song_id AND platform=spec.platform AND metric=spec.metric
     AND metric_date BETWEEN p_from-tol AND least(p_to,p_from+tol)
     AND CASE spec.scope WHEN 'app' THEN source IN ('ios_shortcut','manual') WHEN 'panel' THEN source='tiktok_artists' WHEN 's4a' THEN true ELSE source=CASE WHEN spec.platform='spotify' THEN 'aggregator' ELSE 'tiktok_artists' END END
    ORDER BY abs(metric_date-p_from),CASE source WHEN 'ios_shortcut' THEN 0 WHEN 'aggregator' THEN 1 WHEN 's4a_api' THEN 1 WHEN 'manual' THEN 2 ELSE 3 END,captured_at DESC NULLS LAST LIMIT 1;
   pct:=CASE WHEN b.v<>0 THEN round((a.v-b.v)/b.v*100,2) END;
  END IF;
  ln:=jsonb_build_object('canal',spec.canal,'indicador',spec.indicador,'base',b.v,'base_data',b.d,'base_tipo','inicio_periodo',
   'atual',a.v,'atual_data',a.d,'delta',a.v-b.v,'variacao_pct',pct,'source',a.src,'base_source',b.src,
   'precisao',CASE WHEN spec.scope='app' THEN 'arredondado_app' WHEN spec.scope='panel' THEN 'painel_acumulado' ELSE 'serie' END,
   'precisao_valor',prec,'base_ausente',b.d IS NULL);
  IF a.d IS NOT NULL THEN
   groups_out:=groups_out||jsonb_build_object('grupo',spec.grupo,'linha',ln);
  END IF;
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('grupo',g,'linhas',coalesce((SELECT jsonb_agg(x->'linha') FROM jsonb_array_elements(groups_out) x WHERE x->>'grupo'=g),'[]'::jsonb))) INTO groups_out FROM unnest(ARRAY['musica','video_ugc','redes']) g;
 FOR kp IN SELECT * FROM jsonb_array_elements(v->'kpis') LOOP
  SELECT l INTO ln FROM jsonb_array_elements(groups_out) g,jsonb_array_elements(g->'linhas') l
   WHERE CASE kp->>'chave' WHEN 'streams_spotify' THEN l->>'indicador'='streams' WHEN 'streams_semana' THEN l->>'indicador'='streams' ELSE l->>'indicador'=kp->>'chave' END LIMIT 1;
  IF kp->>'chave'='streams_semana' THEN
   -- A comparison-period KPI must not carry a second, unrelated weekly base.
   kp:=jsonb_build_object('chave','streams_semana','valor',(ln->>'delta')::numeric,'anterior',NULL,'variacao_pct',ln->'variacao_pct',
    'fonte','aggregator_diferenca_periodo','periodo_de',p_from,'periodo_ate',p_to);
  END IF;
  kp:=kp||jsonb_build_object('base',ln->'base','base_data',ln->'base_data','base_tipo','inicio_periodo','atual',CASE WHEN kp->>'chave'='streams_semana' THEN ln->'delta' ELSE ln->'atual' END,'delta',ln->'delta','variacao_pct',ln->'variacao_pct');
  kpis:=kpis||kp;
 END LOOP;
 FOR ent IN SELECT * FROM jsonb_each(v->'series') LOOP
  SELECT coalesce(jsonb_agg(p ORDER BY p->>'d'),'[]') INTO lines FROM jsonb_array_elements(ent.value) p WHERE (p->>'d')::date BETWEEN p_from AND p_to;
  series_out:=series_out||jsonb_build_object(ent.key,lines);
 END LOOP;
 RETURN v||jsonb_build_object('periodo',jsonb_build_object('de',p_from,'ate',p_to),'grupos',groups_out,'kpis',kpis,'series',series_out,
  'notas',jsonb_build_array('Comparação com o ponto mais próximo do início do período; a data real da base consta em cada linha.','Publicações TikTok do app e do painel são métodos distintos; não se somam nem se comparam entre si.'),
  'notas_tecnicas',jsonb_build_array('Base inicio_periodo: ponto mais próximo a ±5 dias, nunca posterior a p_to; sem ponto na janela a base e o delta são null.','Precisão das métricas de artista pelo helper D-ERP186. Streams no período: diferença do acumulado, não soma de acumulados.'));
END $function$

