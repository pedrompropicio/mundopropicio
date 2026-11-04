-- Classe R2 — PREPARADA, NÃO APLICADA. Issue #647 / E2b, autorização 6634950065.
-- §1–§3 ANTES da primeira anonimização. Nenhum SQL deste ficheiro foi aplicado a uma base externa.
-- Instalar numa transação; o backfill é calculado antes de qualquer remoção de identificadores.
-- O DML inicial de retenção (~860 mil linhas) NÃO corre aqui: o 0 chama as funções em lotes,
-- depois da prova SELECT e do «Corro?» de Pedro. Crons separados, instalação pelo 0 com «Sim».
-- Fronteira corrigida (6636691739): agregado d <= hoje-30; eventos d > hoje-30, por fuso.
-- As contagens sem identificadores também são conservadas: a purga não pode apagar resultados.
-- song_link_report_* e song_link_arrivals_hourly: sem DDL/DML; só os corpos autorizados mudam.
-- Backup #202: report_visitor_* incluídos por decisão 6634413910; inventário derivado,
-- não alterar aqui o mecanismo/lista de backup. Confirmar o inventário antes da aplicação.
SET LOCAL lock_timeout = '5s';
-- Serializa backfill com captura, refresh e a instalação dos triggers; locks só na aplicação.
LOCK TABLE public.song_link_events IN SHARE ROW EXCLUSIVE MODE;

-- §1 — grão 0299, Europe/Lisbon; grão 0257, America/Sao_Paulo.
CREATE TABLE public.song_link_ident_daily_stats (
 company_id uuid NOT NULL, artist_id uuid NOT NULL, dia date NOT NULL, link_id uuid NOT NULL,
 utm_campaign text NOT NULL, utm_content text NOT NULL, canal text NOT NULL,
 chegadas bigint NOT NULL, escolhas bigint NOT NULL, aberturas_app bigint NOT NULL,
 aberturas_web bigint NOT NULL, tentativas_app bigint NOT NULL, aberturas_spotify bigint NOT NULL,
 chegadas_spotify bigint NOT NULL, escolhas_por_destino jsonb NOT NULL,
 PRIMARY KEY(company_id,artist_id,dia,link_id,utm_campaign,utm_content,canal)
);
CREATE TABLE public.song_link_ident_daily_origins (
 company_id uuid NOT NULL, artist_id uuid NOT NULL, song_id uuid NOT NULL, metric_day date NOT NULL,
 aberturas_android bigint NOT NULL, toques_ios bigint NOT NULL, aberturas_meta bigint NOT NULL,
 aberturas_tiktok bigint NOT NULL, pessoas_trafego bigint NOT NULL,
 PRIMARY KEY(company_id,artist_id,song_id,metric_day)
);
ALTER TABLE public.song_link_ident_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_link_ident_daily_origins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.song_link_ident_daily_stats, public.song_link_ident_daily_origins FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.song_link_ident_daily_stats, public.song_link_ident_daily_origins TO service_role;
COMMENT ON TABLE public.song_link_ident_daily_stats IS '0299: dia Europe/Lisbon x link x coalesce campaign/content x canal, isolado por empresa/artista. Sem identificadores. Retenção ilimitada.';
COMMENT ON TABLE public.song_link_ident_daily_origins IS '0257: música x dia America/Sao_Paulo, isolado por empresa/artista; filtros paid/click IDs e teste preservados. Sem identificadores. Retenção ilimitada.';

-- Backfill integral com as expressões e filtros canónicos, incluindo grupos de contagem zero.
INSERT INTO public.song_link_ident_daily_stats
WITH ev AS (
    SELECT e.company_id, e.artist_id, e.link_id, e.event, e.opened, e.arrival_event_id, coalesce(e.destination,'(sem)') AS destination,
      coalesce(e.utm_campaign,'') AS utm_campaign, coalesce(e.utm_content,'') AS utm_content,
      (e.created_at AT TIME ZONE 'Europe/Lisbon')::date AS dia,
      public.song_link_event_canal(sl.canal, e.utm_source, e.utm_medium, e.utm_campaign) AS canal
    FROM public.song_link_events e JOIN public.song_links sl ON sl.id = e.link_id
    WHERE e.company_id IS NOT NULL AND e.artist_id IS NOT NULL
  ), base AS (
    SELECT company_id, artist_id, dia, link_id, utm_campaign, utm_content, canal,
      count(*) FILTER (WHERE event = 'arrival') AS chegadas,
      count(*) FILTER (WHERE event = 'choice')  AS escolhas,
      -- Compatibilidade: aberturas_app soma tentativas e sinais da mesma visita.
      count(*) FILTER (WHERE opened = 'app')    AS aberturas_app,
      count(*) FILTER (WHERE opened = 'web')    AS aberturas_web,
      count(*) FILTER (WHERE event IN ('arrival', 'choice') AND opened = 'app') AS tentativas_app,
      count(DISTINCT arrival_event_id) FILTER (WHERE event = 'app_open' AND destination = 'spotify') AS aberturas_spotify,
      count(*) FILTER (WHERE event = 'arrival' AND destination = 'spotify') AS chegadas_spotify
    FROM ev GROUP BY 1,2,3,4,5,6,7
  ), dest AS (
    SELECT company_id, artist_id, dia, link_id, utm_campaign, utm_content, canal, jsonb_object_agg(destination, n) AS d
    FROM (SELECT company_id, artist_id, dia, link_id, utm_campaign, utm_content, canal, destination, count(*) AS n
          FROM ev WHERE event = 'choice' GROUP BY 1,2,3,4,5,6,7,8) x
    GROUP BY 1,2,3,4,5,6,7
  )
SELECT b.*, coalesce(d.d, '{}'::jsonb) AS escolhas_por_destino
FROM base b LEFT JOIN dest d USING(company_id,artist_id,dia,link_id,utm_campaign,utm_content,canal);

INSERT INTO public.song_link_ident_daily_origins
SELECT e.company_id,e.artist_id,e.song_id,(e.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS metric_day,
   count(*) FILTER(WHERE e.event='app_open') aberturas_android,
   count(*) FILTER(WHERE e.event='choice' AND e.os='ios') toques_ios,
   count(*) FILTER(WHERE e.fbclid IS NOT NULL OR lower(e.utm_source) IN ('meta','facebook','fb','instagram','ig')) aberturas_meta,
   count(*) FILTER(WHERE e.ttclid IS NOT NULL OR lower(e.utm_source) IN ('tiktok','tt')) aberturas_tiktok,
   count(DISTINCT e.ip_hash) pessoas_trafego
  FROM public.song_link_events e
  WHERE e.company_id IS NOT NULL AND e.artist_id IS NOT NULL AND e.song_id IS NOT NULL
    AND (e.utm_medium='paid' OR e.fbclid IS NOT NULL OR e.ttclid IS NOT NULL)
    AND (e.utm_content IS NULL OR e.utm_content NOT LIKE 'teste_%')
    AND e.event IN ('app_open','choice')
  GROUP BY 1,2,3,4;

CREATE OR REPLACE FUNCTION public.song_link_ident_daily_refresh(p_from date, p_to date)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC'
AS $refresh$
DECLARE v_count bigint := 0; v_rows bigint;
BEGIN
 IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'invalid day range'; END IF;
 -- O mesmo lock do backfill impede cruzar refresh com anonimização/captura.
 LOCK TABLE public.song_link_events IN SHARE ROW EXCLUSIVE MODE;
 DELETE FROM public.song_link_ident_daily_stats
 WHERE dia BETWEEN p_from AND p_to AND dia > (now() AT TIME ZONE 'Europe/Lisbon')::date-30;
 INSERT INTO public.song_link_ident_daily_stats
WITH ev AS (
    SELECT e.company_id, e.artist_id, e.link_id, e.event, e.opened, e.arrival_event_id, coalesce(e.destination,'(sem)') AS destination,
      coalesce(e.utm_campaign,'') AS utm_campaign, coalesce(e.utm_content,'') AS utm_content,
      (e.created_at AT TIME ZONE 'Europe/Lisbon')::date AS dia,
      public.song_link_event_canal(sl.canal, e.utm_source, e.utm_medium, e.utm_campaign) AS canal
    FROM public.song_link_events e JOIN public.song_links sl ON sl.id = e.link_id
    WHERE e.company_id IS NOT NULL AND e.artist_id IS NOT NULL
      AND (e.created_at AT TIME ZONE 'Europe/Lisbon')::date BETWEEN p_from AND p_to
      AND (e.created_at AT TIME ZONE 'Europe/Lisbon')::date > (now() AT TIME ZONE 'Europe/Lisbon')::date-30
  ), base AS (
    SELECT company_id, artist_id, dia, link_id, utm_campaign, utm_content, canal,
      count(*) FILTER (WHERE event = 'arrival') AS chegadas,
      count(*) FILTER (WHERE event = 'choice')  AS escolhas,
      -- Compatibilidade: aberturas_app soma tentativas e sinais da mesma visita.
      count(*) FILTER (WHERE opened = 'app')    AS aberturas_app,
      count(*) FILTER (WHERE opened = 'web')    AS aberturas_web,
      count(*) FILTER (WHERE event IN ('arrival', 'choice') AND opened = 'app') AS tentativas_app,
      count(DISTINCT arrival_event_id) FILTER (WHERE event = 'app_open' AND destination = 'spotify') AS aberturas_spotify,
      count(*) FILTER (WHERE event = 'arrival' AND destination = 'spotify') AS chegadas_spotify
    FROM ev GROUP BY 1,2,3,4,5,6,7
  ), dest AS (
    SELECT company_id, artist_id, dia, link_id, utm_campaign, utm_content, canal, jsonb_object_agg(destination, n) AS d
    FROM (SELECT company_id, artist_id, dia, link_id, utm_campaign, utm_content, canal, destination, count(*) AS n
          FROM ev WHERE event = 'choice' GROUP BY 1,2,3,4,5,6,7,8) x
    GROUP BY 1,2,3,4,5,6,7
  )
SELECT b.*, coalesce(d.d, '{}'::jsonb) AS escolhas_por_destino
FROM base b LEFT JOIN dest d USING(company_id,artist_id,dia,link_id,utm_campaign,utm_content,canal);
 GET DIAGNOSTICS v_rows=ROW_COUNT; v_count:=v_count+v_rows;
 DELETE FROM public.song_link_ident_daily_origins
 WHERE metric_day BETWEEN p_from AND p_to AND metric_day > (now() AT TIME ZONE 'America/Sao_Paulo')::date-30;
 INSERT INTO public.song_link_ident_daily_origins
SELECT e.company_id,e.artist_id,e.song_id,(e.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS metric_day,
   count(*) FILTER(WHERE e.event='app_open') aberturas_android,
   count(*) FILTER(WHERE e.event='choice' AND e.os='ios') toques_ios,
   count(*) FILTER(WHERE e.fbclid IS NOT NULL OR lower(e.utm_source) IN ('meta','facebook','fb','instagram','ig')) aberturas_meta,
   count(*) FILTER(WHERE e.ttclid IS NOT NULL OR lower(e.utm_source) IN ('tiktok','tt')) aberturas_tiktok,
   count(DISTINCT e.ip_hash) pessoas_trafego
  FROM public.song_link_events e
  WHERE e.company_id IS NOT NULL AND e.artist_id IS NOT NULL AND e.song_id IS NOT NULL
    AND (e.utm_medium='paid' OR e.fbclid IS NOT NULL OR e.ttclid IS NOT NULL)
    AND (e.utm_content IS NULL OR e.utm_content NOT LIKE 'teste_%')
    AND e.event IN ('app_open','choice')
    AND (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_from AND p_to
    AND (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date > (now() AT TIME ZONE 'America/Sao_Paulo')::date-30
  GROUP BY 1,2,3,4;
 GET DIAGNOSTICS v_rows=ROW_COUNT; RETURN v_count+v_rows;
END $refresh$;

-- §2 — assinaturas, SECDEF, guardas de acesso e ACL existentes preservadas.
CREATE OR REPLACE FUNCTION public.artist_song_link_stats(p_artist_id uuid, p_from date, p_to date)
 RETURNS TABLE(dia date, link_id uuid, slug text, song_id uuid, utm_campaign text, utm_content text, chegadas bigint, escolhas bigint, escolhas_por_destino jsonb, aberturas_app bigint, aberturas_web bigint, campanha_id text, campanha_nome text, gasto_campanha_dia numeric, moeda text, custo_por_chegada numeric, canal text, tentativas_app bigint, aberturas_spotify bigint, taxa_abertura numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  WITH guard AS (SELECT public.artist_access_check(p_artist_id,'read','songs') AS company_id),
  ev AS (
    SELECT e.link_id, e.event, e.opened, e.arrival_event_id, coalesce(e.destination,'(sem)') AS destination,
      coalesce(e.utm_campaign,'') AS utm_campaign, coalesce(e.utm_content,'') AS utm_content,
      (e.created_at AT TIME ZONE 'Europe/Lisbon')::date AS dia,
      public.song_link_event_canal(sl.canal, e.utm_source, e.utm_medium, e.utm_campaign) AS canal
    FROM public.song_link_events e JOIN public.song_links sl ON sl.id = e.link_id, guard g
    WHERE e.artist_id = p_artist_id AND e.company_id = g.company_id
      AND e.created_at >= (p_from::timestamp AT TIME ZONE 'Europe/Lisbon')
      AND e.created_at <  ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Lisbon')
      AND (e.created_at AT TIME ZONE 'Europe/Lisbon')::date > (now() AT TIME ZONE 'Europe/Lisbon')::date-30
  ),
  base_recent AS (
    SELECT dia, link_id, utm_campaign, utm_content, canal,
      count(*) FILTER (WHERE event = 'arrival') AS chegadas,
      count(*) FILTER (WHERE event = 'choice')  AS escolhas,
      -- Compatibilidade: aberturas_app soma tentativas e sinais da mesma visita.
      count(*) FILTER (WHERE opened = 'app')    AS aberturas_app,
      count(*) FILTER (WHERE opened = 'web')    AS aberturas_web,
      count(*) FILTER (WHERE event IN ('arrival', 'choice') AND opened = 'app') AS tentativas_app,
      count(DISTINCT arrival_event_id) FILTER (WHERE event = 'app_open' AND destination = 'spotify') AS aberturas_spotify,
      count(*) FILTER (WHERE event = 'arrival' AND destination = 'spotify') AS chegadas_spotify
    FROM ev GROUP BY 1,2,3,4,5
  ),
  dest_recent AS (
    SELECT dia, link_id, utm_campaign, utm_content, canal, jsonb_object_agg(destination, n) AS d
    FROM (SELECT dia, link_id, utm_campaign, utm_content, canal, destination, count(*) AS n
          FROM ev WHERE event = 'choice' GROUP BY 1,2,3,4,5,6) x
    GROUP BY 1,2,3,4,5
  ),
  historical AS (
    SELECT a.* FROM public.song_link_ident_daily_stats a, guard g
    WHERE a.artist_id=p_artist_id AND a.company_id=g.company_id AND a.dia BETWEEN p_from AND p_to
      AND a.dia <= (now() AT TIME ZONE 'Europe/Lisbon')::date-30
  ),
  base AS (
    SELECT * FROM base_recent
    UNION ALL
    SELECT dia,link_id,utm_campaign,utm_content,canal,chegadas,escolhas,aberturas_app,
      aberturas_web,tentativas_app,aberturas_spotify,chegadas_spotify FROM historical
  ),
  dest AS (
    SELECT * FROM dest_recent
    UNION ALL
    SELECT dia,link_id,utm_campaign,utm_content,canal,escolhas_por_destino AS d FROM historical
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
    b.canal, b.tentativas_app, b.aberturas_spotify,
    CASE WHEN b.chegadas_spotify = 0 THEN 0::numeric
         ELSE b.aberturas_spotify::numeric / b.chegadas_spotify END AS taxa_abertura
  FROM base b
  JOIN public.song_links l ON l.id = b.link_id
  LEFT JOIN dest d ON d.dia = b.dia AND d.link_id = b.link_id
                  AND d.utm_campaign = b.utm_campaign AND d.utm_content = b.utm_content AND d.canal = b.canal
  LEFT JOIN camp cm ON b.utm_campaign <> '' AND cm.cslug = b.utm_campaign
  LEFT JOIN spend s ON s.connection_id = cm.connection_id
                   AND s.external_campaign_id = cm.external_campaign_id AND s.date_start = b.dia
  LEFT JOIN tot t ON t.dia = b.dia AND t.utm_campaign = b.utm_campaign
  ORDER BY b.dia DESC, b.chegadas DESC
$function$;

CREATE OR REPLACE FUNCTION public.artist_song_play_origins_compare(p_artist_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_company uuid; v_result jsonb;
BEGIN
 v_company:=public.artist_access_check(p_artist_id,'read','songs');
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>61 THEN RAISE EXCEPTION 'periodo_invalido'; END IF;
 WITH songs AS (SELECT id,title,release_date FROM public.artist_songs WHERE artist_id=p_artist_id AND company_id=v_company AND tracking_status='ativo'),
 dates AS (SELECT s.*,(SELECT max(m.metric_date) FROM public.artist_song_metrics_daily m WHERE m.song_id=s.id AND m.artist_id=p_artist_id AND m.company_id=v_company AND m.metric='s4a_streams_day' AND m.source='s4a_api') s4a_until FROM songs s),
 days AS (SELECT s.*,d::date AS metric_day FROM dates s CROSS JOIN LATERAL generate_series(greatest(p_from,p_to-13)::timestamp,p_to::timestamp,interval '1 day') d),
 metrics AS (SELECT m.song_id,m.metric_date,m.metric,m.value,row_number() OVER(PARTITION BY m.song_id,m.metric_date,m.metric ORDER BY m.captured_at DESC,m.id DESC) rn FROM public.artist_song_metrics_daily m JOIN songs s ON s.id=m.song_id WHERE m.company_id=v_company AND m.artist_id=p_artist_id AND m.platform='spotify' AND m.source='s4a_api' AND m.metric_date BETWEEN greatest(p_from,p_to-13) AND p_to AND (m.metric IN ('s4a_streams_day','s4a_streams_day_br','s4a_streams_day_pt') OR m.metric LIKE 's4a_source_%_day')),
 pl_real AS (SELECT p.song_id,p.snapshot_date,count(*) n,count(p.streams) known,
  count(*) FILTER(WHERE p.playlist_kind IS NULL) unclassified,
  coalesce(sum(p.streams) FILTER(WHERE p.playlist_uri='spotify:playlist:radio' OR lower(trim(p.playlist_name))='radio'),0) radio,
  coalesce(sum(p.streams) FILTER(WHERE p.playlist_kind='algorithmic' AND NOT (p.playlist_uri='spotify:playlist:radio' OR lower(trim(p.playlist_name))='radio')),0) other_algorithmic,
  coalesce(sum(p.streams) FILTER(WHERE p.playlist_kind='editorial'),0) editorial,
  coalesce(sum(p.streams) FILTER(WHERE p.playlist_kind='algotorial'),0) algotorial,
  coalesce(sum(p.streams) FILTER(WHERE p.playlist_kind='editorial' OR p.playlist_kind='algotorial'),0) other_spotify,
  coalesce(sum(p.streams) FILTER(WHERE p.playlist_kind='listener'),0) listeners,
  coalesce(sum(p.streams),0) total_top100
  FROM public.artist_song_playlist_streams p JOIN songs s ON s.id=p.song_id
  WHERE p.company_id=v_company AND p.artist_id=p_artist_id AND p.source='s4a_api' AND p.period_days=1
    AND p.snapshot_date BETWEEN greatest(p_from,p_to-13) AND p_to GROUP BY 1,2),
 pl_est AS (SELECT p.song_id,p.day snapshot_date,count(*) n,count(p.streams_day) known,bool_or(p.estimated) estimated,
  CASE WHEN count(*) FILTER(WHERE p.category='radio')=count(p.streams_day) FILTER(WHERE p.category='radio') THEN coalesce(sum(p.streams_day) FILTER(WHERE p.category='radio'),0) END radio,
  CASE WHEN count(*) FILTER(WHERE p.playlist_kind='algorithmic' AND p.category<>'radio')=count(p.streams_day) FILTER(WHERE p.playlist_kind='algorithmic' AND p.category<>'radio') THEN coalesce(sum(p.streams_day) FILTER(WHERE p.playlist_kind='algorithmic' AND p.category<>'radio'),0) END other_algorithmic,
  CASE WHEN count(*) FILTER(WHERE p.playlist_kind='editorial')=count(p.streams_day) FILTER(WHERE p.playlist_kind='editorial') AND count(*) FILTER(WHERE p.playlist_kind IS NULL)=0 THEN coalesce(sum(p.streams_day) FILTER(WHERE p.playlist_kind='editorial'),0) END editorial,
  CASE WHEN count(*) FILTER(WHERE p.playlist_kind='algotorial')=count(p.streams_day) FILTER(WHERE p.playlist_kind='algotorial') AND count(*) FILTER(WHERE p.playlist_kind IS NULL)=0 THEN coalesce(sum(p.streams_day) FILTER(WHERE p.playlist_kind='algotorial'),0) END algotorial,
  CASE WHEN count(*) FILTER(WHERE p.playlist_kind='listener')=count(p.streams_day) FILTER(WHERE p.playlist_kind='listener') THEN coalesce(sum(p.streams_day) FILTER(WHERE p.playlist_kind='listener'),0) END listeners,
  CASE WHEN count(*) FILTER(WHERE p.made_by='spotify' AND p.category<>'radio')=count(p.streams_day) FILTER(WHERE p.made_by='spotify' AND p.category<>'radio') THEN coalesce(sum(p.streams_day) FILTER(WHERE p.made_by='spotify' AND p.category<>'radio'),0) END other_spotify,
  jsonb_build_object('radio',bool_or(p.estimated) FILTER(WHERE p.category='radio'),'other_algorithmic',bool_or(p.estimated) FILTER(WHERE p.playlist_kind='algorithmic' AND p.category<>'radio'),'editorial',bool_or(p.estimated) FILTER(WHERE p.playlist_kind='editorial'),'algotorial',bool_or(p.estimated) FILTER(WHERE p.playlist_kind='algotorial'),'listener_playlists',bool_or(p.estimated) FILTER(WHERE p.playlist_kind='listener')) estimates
  FROM public.artist_song_playlist_daily p JOIN songs s ON s.id=p.song_id WHERE p.company_id=v_company AND p.artist_id=p_artist_id AND p.day BETWEEN greatest(p_from,p_to-13) AND p_to GROUP BY 1,2),
 pl AS (
  SELECT r.song_id,r.snapshot_date,r.radio,r.other_algorithmic,r.editorial,r.algotorial,r.other_spotify,r.listeners,
   r.total_top100 rest_total,false estimated,'{}'::jsonb estimates,
   CASE WHEN r.unclassified>0 THEN 's4a_top100_1day_unclassified' ELSE 's4a_top100_1day' END cov
  FROM pl_real r WHERE r.n=r.known
  UNION ALL
  SELECT e.song_id,e.snapshot_date,e.radio,e.other_algorithmic,e.editorial,e.algotorial,e.other_spotify,e.listeners,
   e.radio+e.other_spotify+e.listeners,e.estimated,e.estimates,
   CASE WHEN e.n<>e.known THEN 'incomplete_missing_seed_or_snapshot' WHEN e.estimated THEN 's4a_top100_estimated_28day' ELSE 's4a_top100_1day' END
  FROM pl_est e WHERE NOT EXISTS(SELECT 1 FROM pl_real r WHERE r.song_id=e.song_id AND r.snapshot_date=e.snapshot_date AND r.n=r.known)),
 sounds AS (SELECT a.song_id,a.metric_date,sum(a.video_count) total,count(*) n,count(a.video_count) known,array_agg(a.music_id ORDER BY a.music_id) ids,array_agg(a.source ORDER BY a.music_id) sources FROM public.artist_song_tiktok_sound_daily a JOIN songs s ON s.id=a.song_id WHERE a.company_id=v_company AND a.metric_date BETWEEN greatest(p_from,p_to-13)-1 AND p_to GROUP BY 1,2),
 ios_raw AS (SELECT m.song_id,m.metric_date,m.value,row_number() OVER(PARTITION BY m.song_id,m.metric_date ORDER BY m.captured_at DESC,m.id DESC) rn FROM public.artist_song_metrics_daily m JOIN songs s ON s.id=m.song_id WHERE m.company_id=v_company AND m.artist_id=p_artist_id AND m.platform='tiktok' AND m.metric='ugc_videos' AND m.source='ios_shortcut' AND m.value>=0 AND m.metric_date<=p_to),
 ios AS (SELECT song_id,metric_date,value,lag(value) OVER(PARTITION BY song_id ORDER BY metric_date) previous_value,lag(metric_date) OVER(PARTITION BY song_id ORDER BY metric_date) previous_day FROM ios_raw WHERE rn=1),
 traffic_recent AS (SELECT e.song_id,(e.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS metric_day,
   count(*) FILTER(WHERE e.event='app_open') aberturas_android,
   count(*) FILTER(WHERE e.event='choice' AND e.os='ios') toques_ios,
   count(*) FILTER(WHERE e.fbclid IS NOT NULL OR lower(e.utm_source) IN ('meta','facebook','fb','instagram','ig')) aberturas_meta,
   count(*) FILTER(WHERE e.ttclid IS NOT NULL OR lower(e.utm_source) IN ('tiktok','tt')) aberturas_tiktok,
   count(DISTINCT e.ip_hash) pessoas_trafego
  FROM public.song_link_events e JOIN songs s ON s.id=e.song_id
  WHERE e.company_id=v_company AND e.artist_id=p_artist_id
    AND (e.utm_medium='paid' OR e.fbclid IS NOT NULL OR e.ttclid IS NOT NULL)
    AND (e.utm_content IS NULL OR e.utm_content NOT LIKE 'teste_%')
    AND e.event IN ('app_open','choice')
    AND (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN greatest(p_from,p_to-13) AND p_to
    AND (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date > (now() AT TIME ZONE 'America/Sao_Paulo')::date-30
  GROUP BY 1,2),
 traffic AS (
  SELECT * FROM traffic_recent
  UNION ALL
  SELECT a.song_id,a.metric_day,a.aberturas_android,a.toques_ios,a.aberturas_meta,a.aberturas_tiktok,a.pessoas_trafego
  FROM public.song_link_ident_daily_origins a JOIN songs s ON s.id=a.song_id
  WHERE a.company_id=v_company AND a.artist_id=p_artist_id
    AND a.metric_day BETWEEN greatest(p_from,p_to-13) AND p_to
    AND a.metric_day <= (now() AT TIME ZONE 'America/Sao_Paulo')::date-30),
 yt_paid AS (SELECT s.id AS song_id,g.date_start AS metric_day,
   sum(coalesce(nullif(g.video_metrics->>'video_views','')::bigint,0)) youtube_views_pagas
  FROM crm.google_campaign_insights_daily g JOIN songs s
    ON position(regexp_replace(lower(extensions.unaccent(regexp_replace(s.title,'\s*[-–—]?\s*ao vivo.*$','','i'))),'[^a-z0-9]','','g')
       in regexp_replace(lower(extensions.unaccent(g.campaign_name)),'[^a-z0-9]','','g'))>0
  WHERE g.company_id=v_company
    AND g.date_start BETWEEN greatest(p_from,p_to-13) AND p_to
  GROUP BY 1,2),
 yt_pub_raw AS (SELECT m.song_id,m.metric_date,m.value,row_number() OVER(PARTITION BY m.song_id,m.metric_date ORDER BY m.captured_at DESC,m.id DESC) rn
  FROM public.artist_song_metrics_daily m JOIN songs s ON s.id=m.song_id
  WHERE m.company_id=v_company AND m.artist_id=p_artist_id AND m.metric='youtube_views' AND m.source='youtube_public'
    AND m.metric_date BETWEEN greatest(p_from,p_to-13)-1 AND p_to),
 yt_pub AS (SELECT song_id,metric_date,value,lag(value) OVER(PARTITION BY song_id ORDER BY metric_date) previous_value
  FROM yt_pub_raw WHERE rn=1),
 result_rows AS (SELECT d.id song_id,d.title,d.metric_day AS day,d.s4a_until,CASE WHEN d.metric_day<=d.s4a_until THEN m.value END spotify_total,CASE WHEN d.metric_day<=d.s4a_until THEN mbr.value END spotify_br,CASE WHEN d.metric_day<=d.s4a_until THEN mpt.value END spotify_pt,
  p.radio,p.other_spotify,p.other_algorithmic,p.editorial,p.algotorial,p.listeners listener_playlists,p.estimated,coalesce(p.estimates,'{}'::jsonb) estimated_fields,
  CASE WHEN p.rest_total IS NOT NULL AND m.value>=p.rest_total THEN m.value-p.rest_total END rest,
  CASE WHEN m.value>0 THEN round(p.radio/m.value*100,4) END radio_pct,
  (SELECT coalesce(jsonb_object_agg(x.metric,x.value),'{}'::jsonb) FROM metrics x WHERE x.song_id=d.id AND x.metric_date=d.metric_day AND x.rn=1 AND x.metric LIKE 's4a_source_%_day') source_categories,
  CASE WHEN p.song_id IS NULL THEN 'unavailable' ELSE p.cov END playlist_coverage,
  i.value ugc_total,i.value-i.previous_value ugc_new,i.metric_date-i.previous_day ugc_days_covered,i.previous_day ugc_previous_capture_day,
  'ios_shortcut'::text ugc_source,'centena'::text ugc_precision,(i.metric_date IS NULL) ugc_capture_missing,coalesce(i.value<i.previous_value,false) ugc_drop,
  CASE WHEN a.n=a.known THEN a.total END apify_total,a.n sound_count,CASE WHEN a.n=a.known AND prev.n=prev.known THEN a.total-prev.total END apify_new,
  CASE WHEN a.n=a.known AND prev.n=prev.known THEN a.total<prev.total ELSE false END apify_drop,
  CASE WHEN a.ids IS NOT NULL AND prev.ids IS NOT NULL THEN a.ids=prev.ids END same_sounds,CASE WHEN a.ids=prev.ids THEN a.sources=prev.sources END same_sources,
  CASE WHEN d.metric_day>='2026-10-25'::date THEN t.aberturas_android END aberturas_android,
  t.toques_ios,
  CASE WHEN d.metric_day>='2026-10-25'::date THEN coalesce(t.aberturas_android,0)+coalesce(t.toques_ios,0) ELSE t.toques_ios END aberturas_trafego,
  t.aberturas_meta,t.aberturas_tiktok,t.pessoas_trafego,
  yp.youtube_views_pagas,
  CASE WHEN y.value IS NOT NULL AND y.previous_value IS NOT NULL THEN y.value-y.previous_value END youtube_views_dia,
  true youtube_views_dia_aprox,
  CASE WHEN y.value IS NOT NULL AND y.previous_value IS NOT NULL AND yp.youtube_views_pagas IS NOT NULL THEN y.value-y.previous_value-yp.youtube_views_pagas END youtube_views_alem_pagas
  FROM days d LEFT JOIN ios i ON i.song_id=d.id AND i.metric_date=d.metric_day LEFT JOIN metrics m ON m.song_id=d.id AND m.metric_date=d.metric_day AND m.metric='s4a_streams_day' AND m.rn=1 LEFT JOIN metrics mbr ON mbr.song_id=d.id AND mbr.metric_date=d.metric_day AND mbr.metric='s4a_streams_day_br' AND mbr.rn=1 LEFT JOIN metrics mpt ON mpt.song_id=d.id AND mpt.metric_date=d.metric_day AND mpt.metric='s4a_streams_day_pt' AND mpt.rn=1 LEFT JOIN pl p ON p.song_id=d.id AND p.snapshot_date=d.metric_day LEFT JOIN sounds a ON a.song_id=d.id AND a.metric_date=d.metric_day LEFT JOIN sounds prev ON prev.song_id=d.id AND prev.metric_date=d.metric_day-1
  LEFT JOIN traffic t ON t.song_id=d.id AND t.metric_day=d.metric_day
  LEFT JOIN yt_paid yp ON yp.song_id=d.id AND yp.metric_day=d.metric_day
  LEFT JOIN yt_pub y ON y.song_id=d.id AND y.metric_date=d.metric_day)
 SELECT jsonb_build_object('available',true,'source_origin_capture_enabled',false,'scope','global_song_not_ad_country','playlist_note','Top 100 observado; resto inclui playlists não listadas e outras origens. Não é a divisão completa por origem.','estimated',coalesce(bool_or(estimated),false),'days',coalesce(jsonb_agg(to_jsonb(result_rows) ORDER BY day,song_id),'[]'::jsonb)) INTO v_result FROM result_rows;
 RETURN v_result;
END $function$;

-- §3 — saída antecipada; o restante corpo de cada trigger é byte a byte igual.
CREATE OR REPLACE FUNCTION public.song_link_report_hourly_track() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE vo boolean:=false;vn boolean:=false;oh timestamptz;nh timestamptz;ks bigint[];k bigint;timeout_old text;err text;
BEGIN
IF current_setting('song_link.retencao', true) = 'on' THEN RETURN NULL; END IF;
IF TG_OP<>'INSERT' THEN vo:=OLD.event='arrival';END IF;IF TG_OP<>'DELETE' THEN vn:=NEW.event='arrival';END IF;IF NOT vo AND NOT vn THEN RETURN NULL;END IF;
IF TG_OP='UPDATE' AND vo AND vn AND ROW(OLD.company_id,OLD.artist_id,OLD.created_at,OLD.country,OLD.ip_hash,OLD.utm_source,OLD.utm_medium,OLD.utm_campaign,OLD.link_id) IS NOT DISTINCT FROM ROW(NEW.company_id,NEW.artist_id,NEW.created_at,NEW.country,NEW.ip_hash,NEW.utm_source,NEW.utm_medium,NEW.utm_campaign,NEW.link_id) THEN RETURN NULL;END IF;
IF vo THEN oh:=date_trunc('hour',OLD.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';END IF;IF vn THEN nh:=date_trunc('hour',NEW.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';END IF;
timeout_old:=current_setting('lock_timeout');
BEGIN
PERFORM set_config('lock_timeout','25ms',true);
SELECT array_agg(DISTINCT x ORDER BY x) INTO ks FROM unnest(ARRAY[CASE WHEN vo THEN public.song_link_arrivals_hour_key(OLD.artist_id,oh) END,CASE WHEN vn THEN public.song_link_arrivals_hour_key(NEW.artist_id,nh) END]) x WHERE x IS NOT NULL;
FOREACH k IN ARRAY coalesce(ks,ARRAY[]::bigint[]) LOOP IF NOT pg_try_advisory_xact_lock(k) THEN RAISE EXCEPTION 'report hour busy' USING ERRCODE='55P03';END IF;END LOOP;
IF vo THEN PERFORM public.song_link_report_hour_delta(OLD,-1);END IF;IF vn THEN PERFORM public.song_link_report_hour_delta(NEW,1);END IF;
EXCEPTION WHEN OTHERS THEN err:=SQLSTATE;
BEGIN
IF vo THEN INSERT INTO public.song_link_report_hourly_log(artist_id,hour_utc,kind,error_code) VALUES(OLD.artist_id,oh,'pending',err);END IF;IF vn THEN INSERT INTO public.song_link_report_hourly_log(artist_id,hour_utc,kind,error_code) VALUES(NEW.artist_id,nh,'pending',err);END IF;
EXCEPTION WHEN OTHERS THEN
BEGIN UPDATE public.song_link_report_hourly_state SET ready=false WHERE artist_id IN(CASE WHEN vo THEN OLD.artist_id END,CASE WHEN vn THEN NEW.artist_id END);EXCEPTION WHEN OTHERS THEN RAISE WARNING 'report readiness invalidation failed (%)',SQLSTATE;END;
RAISE WARNING 'report log failed (%); capture retained',SQLSTATE;END;
END;
PERFORM set_config('lock_timeout',timeout_old,true);RETURN NULL;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'report trigger failed (%); capture retained',SQLSTATE;RETURN NULL;
END $f$;

CREATE OR REPLACE FUNCTION public.song_link_arrivals_hourly_track()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_old boolean:=false; v_new boolean:=false; v_oh timestamptz; v_nh timestamptz;
 v_keys bigint[]; v_key bigint; v_timeout text; v_error text;
BEGIN
IF current_setting('song_link.retencao', true) = 'on' THEN RETURN NULL; END IF;
 IF TG_OP<>'INSERT' THEN v_old:=OLD.event='arrival'; END IF;
 IF TG_OP<>'DELETE' THEN v_new:=NEW.event='arrival'; END IF;
 IF NOT v_old AND NOT v_new THEN RETURN NULL; END IF;
 IF TG_OP='UPDATE' AND v_old AND v_new AND
  ROW(OLD.company_id,OLD.artist_id,OLD.created_at,OLD.country,OLD.os,OLD.utm_source,OLD.utm_medium,OLD.utm_campaign,OLD.utm_content,OLD.utm_term,OLD.link_id)
  IS NOT DISTINCT FROM
  ROW(NEW.company_id,NEW.artist_id,NEW.created_at,NEW.country,NEW.os,NEW.utm_source,NEW.utm_medium,NEW.utm_campaign,NEW.utm_content,NEW.utm_term,NEW.link_id) THEN RETURN NULL; END IF;
 IF v_old THEN v_oh:=date_trunc('hour',OLD.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'; END IF;
 IF v_new THEN v_nh:=date_trunc('hour',NEW.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'; END IF;
 v_timeout:=current_setting('lock_timeout');
 BEGIN
  PERFORM set_config('lock_timeout','25ms',true);
  SELECT array_agg(DISTINCT k ORDER BY k) INTO v_keys FROM unnest(ARRAY[
   CASE WHEN v_old THEN public.song_link_arrivals_hour_key(OLD.artist_id,v_oh) END,
   CASE WHEN v_new THEN public.song_link_arrivals_hour_key(NEW.artist_id,v_nh) END]) k WHERE k IS NOT NULL;
  FOREACH v_key IN ARRAY coalesce(v_keys,ARRAY[]::bigint[]) LOOP
   IF NOT pg_try_advisory_xact_lock(v_key) THEN RAISE EXCEPTION 'arrivals_hourly: busy hour' USING ERRCODE='55P03'; END IF;
  END LOOP;
  IF v_old THEN PERFORM public.song_link_arrivals_hour_delta(OLD,-1); END IF;
  IF v_new THEN PERFORM public.song_link_arrivals_hour_delta(NEW,1); END IF;
 EXCEPTION WHEN OTHERS THEN
  v_error:=SQLSTATE;
  BEGIN
   IF v_old THEN INSERT INTO public.song_link_arrivals_hourly_log(artist_id,hour_utc,kind,error_code) VALUES(OLD.artist_id,v_oh,'pending',v_error); END IF;
   IF v_new THEN INSERT INTO public.song_link_arrivals_hourly_log(artist_id,hour_utc,kind,error_code) VALUES(NEW.artist_id,v_nh,'pending',v_error); END IF;
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'arrivals_hourly log failed (%); capture retained',SQLSTATE; END;
 END;
 PERFORM set_config('lock_timeout',v_timeout,true);
 RETURN NULL;
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING 'arrivals_hourly trigger failed (%); capture retained',SQLSTATE;
 RETURN NULL;
END $fn$;

-- §4 — recusa se o dia mais recente elegível (em cada fuso) não estiver agregado.
-- Confere também todas as dimensões elegíveis: uma linha de outro artista não prova cobertura.
CREATE OR REPLACE FUNCTION public.anonymize_song_link_events(p_days integer DEFAULT 30, p_batch integer DEFAULT 20000)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC'
AS $anon$
DECLARE v_cutoff timestamptz; v_count bigint; v_mark text := current_setting('song_link.retencao',true);
BEGIN
 IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501'; END IF;
 IF p_days IS NULL OR p_days<30 THEN RAISE EXCEPTION 'p_days must be >= 30'; END IF;
 IF p_batch IS NULL OR p_batch<1 THEN RAISE EXCEPTION 'p_batch must be positive'; END IF;
 v_cutoff:=now()-make_interval(days => p_days);
 LOCK TABLE public.song_link_events IN SHARE ROW EXCLUSIVE MODE;
 IF EXISTS (
  SELECT 1 FROM public.song_link_events e JOIN public.song_links sl ON sl.id=e.link_id
  WHERE e.created_at<v_cutoff AND (e.ip_hash IS NOT NULL OR e.fbclid IS NOT NULL OR e.ttclid IS NOT NULL OR e.capi_fbp IS NOT NULL OR e.capi_fbc IS NOT NULL OR e.capi_external_id IS NOT NULL OR e.event_id IS NOT NULL OR e.arrival_event_id IS NOT NULL)
    AND e.company_id IS NOT NULL AND e.artist_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.song_link_ident_daily_stats a
      WHERE a.company_id=e.company_id AND a.artist_id=e.artist_id
        AND a.dia=(e.created_at AT TIME ZONE 'Europe/Lisbon')::date AND a.link_id=e.link_id
        AND a.utm_campaign=coalesce(e.utm_campaign,'') AND a.utm_content=coalesce(e.utm_content,'')
        AND a.canal=public.song_link_event_canal(sl.canal,e.utm_source,e.utm_medium,e.utm_campaign))
 ) OR EXISTS (
  SELECT 1 FROM public.song_link_events e
  WHERE e.created_at<v_cutoff AND (e.ip_hash IS NOT NULL OR e.fbclid IS NOT NULL OR e.ttclid IS NOT NULL OR e.capi_fbp IS NOT NULL OR e.capi_fbc IS NOT NULL OR e.capi_external_id IS NOT NULL OR e.event_id IS NOT NULL OR e.arrival_event_id IS NOT NULL)
    AND e.company_id IS NOT NULL AND e.artist_id IS NOT NULL AND e.song_id IS NOT NULL
    AND (e.utm_medium='paid' OR e.fbclid IS NOT NULL OR e.ttclid IS NOT NULL)
    AND (e.utm_content IS NULL OR e.utm_content NOT LIKE 'teste_%') AND e.event IN ('app_open','choice')
    AND NOT EXISTS (SELECT 1 FROM public.song_link_ident_daily_origins a
      WHERE a.company_id=e.company_id AND a.artist_id=e.artist_id AND a.song_id=e.song_id
        AND a.metric_day=(e.created_at AT TIME ZONE 'America/Sao_Paulo')::date)
 ) THEN RAISE EXCEPTION 'retencao: missing daily aggregate coverage, including latest eligible day; run backfill/refresh before anonymizing'; END IF;
 PERFORM set_config('song_link.retencao','on',true);
 UPDATE public.song_link_events SET ip_hash=NULL,fbclid=NULL,ttclid=NULL,capi_fbp=NULL,capi_fbc=NULL,
   capi_external_id=NULL,event_id=NULL,arrival_event_id=NULL,created_at=date_trunc('hour',created_at)
 WHERE ctid IN (SELECT e.ctid FROM public.song_link_events e WHERE e.created_at<v_cutoff AND (e.ip_hash IS NOT NULL OR e.fbclid IS NOT NULL OR e.ttclid IS NOT NULL OR e.capi_fbp IS NOT NULL OR e.capi_fbc IS NOT NULL OR e.capi_external_id IS NOT NULL OR e.event_id IS NOT NULL OR e.arrival_event_id IS NOT NULL)
   ORDER BY e.created_at,e.id LIMIT p_batch);
 GET DIAGNOSTICS v_count=ROW_COUNT;
 PERFORM set_config('song_link.retencao',coalesce(v_mark,''),true);
 RETURN v_count;
END $anon$;

-- §5 — meses de calendário, sem alterar os agregados existentes ou os novos.
CREATE OR REPLACE FUNCTION public.purge_song_link_events(p_months integer DEFAULT 13, p_batch integer DEFAULT 20000)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC'
AS $purge$
DECLARE v_count bigint; v_mark text := current_setting('song_link.retencao',true);
BEGIN
 IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501'; END IF;
 IF p_months IS NULL OR p_months<13 THEN RAISE EXCEPTION 'p_months must be >= 13'; END IF;
 IF p_batch IS NULL OR p_batch<1 THEN RAISE EXCEPTION 'p_batch must be positive'; END IF;
 LOCK TABLE public.song_link_events IN SHARE ROW EXCLUSIVE MODE;
 PERFORM set_config('song_link.retencao','on',true);
 DELETE FROM public.song_link_events WHERE ctid IN (
   SELECT ctid FROM public.song_link_events WHERE created_at<now()-make_interval(months => p_months)
   ORDER BY created_at,id LIMIT p_batch);
 GET DIAGNOSTICS v_count=ROW_COUNT;
 PERFORM set_config('song_link.retencao',coalesce(v_mark,''),true);
 RETURN v_count;
END $purge$;

-- §6 — reconstrução antiga recusada; validação compara apenas horas completas seguras.
CREATE OR REPLACE FUNCTION public.song_link_report_hourly_rebuild(p_artist uuid,p_from timestamptz,p_to timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $f$
DECLARE h timestamptz;ids uuid[];diff bigint;total bigint:=0;hours integer:=0;
BEGIN
IF session_user<>'postgres' AND coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501';END IF;
IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from OR p_to-p_from>interval '24 hours' OR p_from<>date_trunc('hour',p_from AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' OR p_to<>date_trunc('hour',p_to AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' THEN RAISE EXCEPTION 'bounded whole UTC hours required';END IF;
IF p_from < now()-make_interval(days => 30) THEN RAISE EXCEPTION 'retencao: cannot rebuild hours older than 30 days; retained aggregates are authoritative'; END IF;
FOR h IN SELECT generate_series(p_from,p_to-interval '1 hour',interval '1 hour') LOOP
PERFORM pg_advisory_xact_lock(public.song_link_arrivals_hour_key(p_artist,h));
PERFORM 1 FROM public.song_links l WHERE EXISTS(SELECT 1 FROM public.song_link_events e WHERE e.link_id=l.id AND e.artist_id=p_artist AND e.event='arrival' AND e.created_at>=h AND e.created_at<h+interval '1 hour') ORDER BY l.id FOR SHARE;
SELECT array_agg(id) INTO ids FROM public.song_link_report_hourly_log WHERE artist_id=p_artist AND hour_utc=h AND kind='pending' AND repaired_at IS NULL;
WITH src AS MATERIALIZED(SELECT e.company_id,e.artist_id,jsonb_build_array(e.link_id,lower(coalesce(e.utm_source,'')),e.utm_medium,e.utm_campaign,e.country,public.song_link_event_canal(l.canal,e.utm_source,e.utm_medium,e.utm_campaign)) dim,count(*)::bigint n FROM public.song_link_events e LEFT JOIN public.song_links l ON l.id=e.link_id WHERE e.artist_id=p_artist AND e.event='arrival' AND e.created_at>=h AND e.created_at<h+interval '1 hour' GROUP BY 1,2,3),
old AS MATERIALIZED(SELECT * FROM public.song_link_report_hourly WHERE artist_id=p_artist AND hour_utc=h),
dif AS(SELECT count(*) n FROM src s FULL JOIN old o USING(artist_id,dim) WHERE coalesce(s.n,0)<>coalesce(o.n,0) OR s.company_id IS DISTINCT FROM o.company_id),
removed AS(DELETE FROM public.song_link_report_hourly o WHERE o.artist_id=p_artist AND o.hour_utc=h AND NOT EXISTS(SELECT 1 FROM src s WHERE s.dim=o.dim) RETURNING 1),
written AS(INSERT INTO public.song_link_report_hourly(company_id,artist_id,hour_utc,dim,n) SELECT company_id,artist_id,h,dim,n FROM src ON CONFLICT(artist_id,hour_utc,dim) DO UPDATE SET company_id=excluded.company_id,n=excluded.n,updated_at=clock_timestamp() RETURNING 1)
SELECT n INTO diff FROM dif;total:=total+diff;
WITH e AS MATERIALIZED(SELECT e.*,public.song_link_event_canal(l.canal,e.utm_source,e.utm_medium,e.utm_campaign) canal FROM public.song_link_events e LEFT JOIN public.song_links l ON l.id=e.link_id WHERE e.artist_id=p_artist AND e.event='arrival' AND e.created_at>=h AND e.created_at<h+interval '1 hour'),
src AS MATERIALIZED(SELECT company_id,artist_id,'campaign'::text kind,jsonb_build_array(lower(coalesce(utm_source,'')),utm_campaign,country,ip_hash) dim,count(*)::bigint n FROM e GROUP BY 1,2,4 UNION ALL SELECT company_id,artist_id,'channel',jsonb_build_array(canal,country,ip_hash),count(*)::bigint FROM e GROUP BY 1,2,4),
old AS MATERIALIZED(SELECT * FROM public.song_link_report_visitors_hourly WHERE artist_id=p_artist AND hour_utc=h),
dif AS(SELECT count(*) n FROM src s FULL JOIN old o USING(artist_id,kind,dim) WHERE coalesce(s.n,0)<>coalesce(o.n,0) OR s.company_id IS DISTINCT FROM o.company_id),
removed AS(DELETE FROM public.song_link_report_visitors_hourly o WHERE o.artist_id=p_artist AND o.hour_utc=h AND NOT EXISTS(SELECT 1 FROM src s WHERE s.kind=o.kind AND s.dim=o.dim) RETURNING 1),
written AS(INSERT INTO public.song_link_report_visitors_hourly(company_id,artist_id,hour_utc,kind,dim,n) SELECT company_id,artist_id,h,kind,dim,n FROM src ON CONFLICT(artist_id,hour_utc,kind,dim) DO UPDATE SET company_id=excluded.company_id,n=excluded.n RETURNING 1)
SELECT n INTO diff FROM dif;total:=total+diff;
UPDATE public.song_link_report_hourly_log SET repaired_at=clock_timestamp() WHERE id=ANY(coalesce(ids,ARRAY[]::uuid[]));
INSERT INTO public.song_link_report_hourly_log(artist_id,hour_utc,kind,divergent_rows) VALUES(p_artist,h,'reconcile',diff);hours:=hours+1;
END LOOP;
RETURN jsonb_build_object('hours',hours,'divergent_rows',total);
END $f$;

CREATE OR REPLACE FUNCTION public.song_link_report_hourly_validate(p_artist uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $v$
DECLARE d bigint;src_n bigint;agg_n bigint;pending bigint;cutoff timestamptz:=date_trunc('hour',now()-make_interval(days => 30))+interval '1 hour';
BEGIN
IF session_user<>'postgres' AND coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501';END IF;
WITH src AS MATERIALIZED(SELECT e.company_id,e.artist_id,date_trunc('hour',e.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' h,jsonb_build_array(e.link_id,lower(coalesce(e.utm_source,'')),e.utm_medium,e.utm_campaign,e.country,public.song_link_event_canal(l.canal,e.utm_source,e.utm_medium,e.utm_campaign)) dim,lower(coalesce(e.utm_source,'')) source,e.utm_campaign,e.country,e.ip_hash,public.song_link_event_canal(l.canal,e.utm_source,e.utm_medium,e.utm_campaign) canal FROM public.song_link_events e LEFT JOIN public.song_links l ON l.id=e.link_id WHERE e.artist_id=p_artist AND e.event='arrival' AND e.created_at>=cutoff),
counts AS(SELECT company_id,artist_id,h,dim,count(*) n FROM src GROUP BY 1,2,3,4),
members AS(SELECT company_id,artist_id,h,'campaign'::text kind,jsonb_build_array(source,utm_campaign,country,ip_hash) dim,count(*) n FROM src GROUP BY 1,2,3,5 UNION ALL SELECT company_id,artist_id,h,'channel',jsonb_build_array(canal,country,ip_hash),count(*) FROM src GROUP BY 1,2,3,5),
dif AS(SELECT 1 FROM counts s FULL JOIN(SELECT * FROM public.song_link_report_hourly WHERE artist_id=p_artist AND hour_utc>=cutoff AND n>0)a ON(s.artist_id,s.h,s.dim)=(a.artist_id,a.hour_utc,a.dim) WHERE coalesce(s.n,0)<>coalesce(a.n,0) OR s.company_id IS DISTINCT FROM a.company_id UNION ALL SELECT 1 FROM members s FULL JOIN(SELECT * FROM public.song_link_report_visitors_hourly WHERE artist_id=p_artist AND hour_utc>=cutoff AND n>0)a ON(s.artist_id,s.h,s.kind,s.dim)=(a.artist_id,a.hour_utc,a.kind,a.dim) WHERE coalesce(s.n,0)<>coalesce(a.n,0) OR s.company_id IS DISTINCT FROM a.company_id)
SELECT(SELECT count(*) FROM dif),(SELECT count(*) FROM src),(SELECT coalesce(sum(n),0) FROM public.song_link_report_hourly WHERE artist_id=p_artist AND hour_utc>=cutoff),(SELECT count(*) FROM public.song_link_report_hourly_log WHERE artist_id=p_artist AND hour_utc>=cutoff AND kind='pending' AND repaired_at IS NULL) INTO d,src_n,agg_n,pending;
INSERT INTO public.song_link_report_hourly_state(artist_id,ready,verified_at) VALUES(p_artist,d=0 AND pending=0,clock_timestamp()) ON CONFLICT(artist_id) DO UPDATE SET ready=excluded.ready,verified_at=excluded.verified_at;
RETURN jsonb_build_object('source',src_n,'aggregate',agg_n,'divergent_rows',d,'pending',pending,'ready',d=0 AND pending=0);
END $v$;
REVOKE ALL ON FUNCTION public.song_link_ident_daily_refresh(date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.song_link_ident_daily_refresh(date,date) TO service_role;
COMMENT ON FUNCTION public.song_link_ident_daily_refresh(date,date) IS 'Recalcula os dois fusos; nunca reescreve dias <= hoje-30 de cada fuso; chamar antes da anonimização.';
REVOKE ALL ON FUNCTION public.anonymize_song_link_events(integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_song_link_events(integer,integer) TO service_role;
COMMENT ON FUNCTION public.anonymize_song_link_events(integer,integer) IS 'Só serviço; mínimo 30 dias; lote limitado; exige cobertura diária; NULL dos oito IDs e arredonda hora UTC; preserva agregados.';
REVOKE ALL ON FUNCTION public.purge_song_link_events(integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_song_link_events(integer,integer) TO service_role;
COMMENT ON FUNCTION public.purge_song_link_events(integer,integer) IS 'Só serviço; mínimo 13 meses; lote limitado; preserva todos os agregados.';
REVOKE ALL ON FUNCTION public.song_link_report_hourly_track() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.song_link_report_hourly_track() TO service_role;
COMMENT ON FUNCTION public.song_link_report_hourly_track() IS '0229 inalterada excepto bypass transacional song_link.retencao=on durante manutenção.';
REVOKE ALL ON FUNCTION public.song_link_arrivals_hourly_track() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.song_link_arrivals_hourly_track() TO service_role;
COMMENT ON FUNCTION public.song_link_arrivals_hourly_track() IS '0225 inalterada excepto bypass transacional song_link.retencao=on durante manutenção.';
REVOKE ALL ON FUNCTION public.song_link_report_hourly_rebuild(uuid,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.song_link_report_hourly_rebuild(uuid,timestamptz,timestamptz) TO service_role;
COMMENT ON FUNCTION public.song_link_report_hourly_rebuild(uuid,timestamptz,timestamptz) IS '0229 com recusa de horas anteriores a now()-30 dias: os agregados retidos são autoritativos.';
REVOKE ALL ON FUNCTION public.song_link_report_hourly_validate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.song_link_report_hourly_validate(uuid) TO service_role;
COMMENT ON FUNCTION public.song_link_report_hourly_validate(uuid) IS '0229: valida só horas completas posteriores ao corte de 30 dias; histórico retido não é reconstruído.';
COMMENT ON FUNCTION public.artist_song_link_stats(uuid,date,date) IS '0299: dias <= hoje-30 de Lisboa nos agregados de retenção; ACL e resultado preservados.';
COMMENT ON FUNCTION public.artist_song_play_origins_compare(uuid,date,date) IS '0257: dias <= hoje-30 de São Paulo nos agregados de retenção; ACL e resultado preservados.';
