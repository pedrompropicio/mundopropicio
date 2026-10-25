CREATE OR REPLACE FUNCTION public.artist_ads_compare(p_artist_id uuid, p_from date, p_to date, p_country text DEFAULT NULL::text, p_tz text DEFAULT 'America/Sao_Paulo'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
-- Visão comparativa fase 2 (D-ERP comparativo).
-- Mapa device -> android/ios/outro (anúncios):
--   meta: android_smartphone, android_tablet -> android; iphone, ipad, ipod -> ios; desktop, other, resto -> outro
--   google: MOBILE, TABLET, DESKTOP, CONNECTED_TV, OTHER -> outro (o Google não separa Android/iOS)
--   tiktok: sem breakdown device
-- Mapa chegadas (song_link_events.os): android -> android; ios -> ios; resto/NULL -> outro.
-- Nível: só o mais alto por (connection, campanha, dia, hora): campaign > adset (igual a artist_ads_breakdowns).
-- Moeda das chegadas: única moeda da plataforma no período; se houver várias, pela moeda das campanhas
-- do market_country igual ao país da chegada (se única); senão fica sem moeda (lacuna).
-- trafego_diario (25/10/2026): custo_por_chegada = gasto das campanhas que levam ao smart link
-- ÷ chegadas atribuídas a essas campanhas. Prova de destino, por ordem:
--  (a) chegadas atribuídas (Meta: utm_term = id do anúncio; qualquer plataforma: chave
--      normalizada do utm_campaign contida na chave do nome da campanha, ou vice-versa,
--      mesma plataforma, chaves >= 10 chars — regra canónica do relatório de período);
--  (b) Meta: algum anúncio da campanha tem destino /m/… no criativo.
-- Visualizações/alcance sem destino ficam em gasto_sem_destino. Nunca se decide pelo nome.
DECLARE
  v_company uuid;
  v_now timestamp;
  v_hcut timestamp;
  v_today date;
  v_from_ts timestamp := p_from::timestamp;
  v_to_ts timestamp := (p_to + 1)::timestamp;
  v_lo date;
  v_hi date;
  r jsonb;
BEGIN
  v_company := public.artist_access_check(p_artist_id, 'read', 'traffic');
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'periodo_invalido'; END IF;
  IF (p_to - p_from) + 1 > 62 THEN RAISE EXCEPTION 'periodo_maximo_62_dias'; END IF;
  v_now := now() AT TIME ZONE p_tz;
  v_hcut := date_trunc('hour', v_now);
  v_today := v_now::date;
  v_lo := least(p_from, v_today - 1) - 1;
  v_hi := greatest(p_to, v_today) + 1;

  WITH conns AS (
    SELECT c.id, c.platform, c.selected_ad_account_currency FROM crm.ad_platform_connections c
    WHERE c.connection_scope = 'artist' AND c.artist_id = p_artist_id AND c.company_id = v_company
  ),
  cmc AS (
    SELECT 'meta'::text platform, s.connection_id, s.external_campaign_id cid, coalesce(s.market_country,'?') mc
      FROM crm.meta_campaign_snapshot s JOIN conns c ON c.id=s.connection_id
    UNION ALL SELECT 'google', g.connection_id, g.external_campaign_id, coalesce(g.market_country,'?')
      FROM crm.google_campaign g JOIN conns c ON c.id=g.connection_id
    UNION ALL SELECT 'tiktok', t.connection_id, t.external_campaign_id, coalesce(t.market_country,'?')
      FROM crm.tiktok_campaign_carreira t JOIN conns c ON c.id=t.connection_id
  ),
  cmn AS (
    SELECT 'meta'::text platform, s.connection_id, s.external_campaign_id cid, public.artist_ads_campaign_key(s.name) nkey
      FROM crm.meta_campaign_snapshot s JOIN conns c ON c.id=s.connection_id
    UNION ALL SELECT 'google', g.connection_id, g.external_campaign_id, public.artist_ads_campaign_key(g.name)
      FROM crm.google_campaign g JOIN conns c ON c.id=g.connection_id
    UNION ALL SELECT 'tiktok', t.connection_id, t.external_campaign_id, public.artist_ads_campaign_key(t.name)
      FROM crm.tiktok_campaign_carreira t JOIN conns c ON c.id=t.connection_id
  ),
  msl AS (
    SELECT s.connection_id, s.external_campaign_id cid, s.external_ad_id ad_id,
      (coalesce(
        s.raw->'creative'#>>'{object_story_spec,link_data,link}',
        s.raw->'creative'#>>'{object_story_spec,video_data,call_to_action,value,link}',
        s.raw->'creative'#>>'{object_story_spec,link_data,call_to_action,value,link}',
        s.raw->'creative'#>>'{asset_feed_spec,link_urls,0,website_url}',
        s.raw->'creative'->>'link_url','') LIKE '%/m/%') smart
    FROM crm.meta_ad_snapshot s JOIN conns c ON c.id=s.connection_id AND c.platform='meta'
  ),
  hr AS (
    SELECT h.platform, coalesce(h.currency, c.selected_ad_account_currency) cur, h.level, h.connection_id,
      h.external_campaign_id cid, h.metric_date, h.metric_hour, h.spend_cents, h.impressions, h.clicks, h.last_synced_at,
      ((h.metric_date + h.metric_hour * interval '1 hour') AT TIME ZONE h.account_timezone) AT TIME ZONE p_tz ts,
      min(CASE h.level WHEN 'campaign' THEN 1 WHEN 'adset' THEN 2 ELSE 3 END)
        OVER (PARTITION BY h.connection_id, h.external_campaign_id, h.metric_date, h.metric_hour) top_rank,
      CASE h.level WHEN 'campaign' THEN 1 WHEN 'adset' THEN 2 ELSE 3 END my_rank
    FROM crm.ads_insights_hourly h JOIN conns c ON c.id = h.connection_id
    WHERE h.metric_date BETWEEN v_lo AND v_hi
  ),
  sync AS (
    SELECT c.platform, max(x.last_synced_at) ult FROM conns c
    LEFT JOIN crm.ads_insights_hourly x ON x.connection_id = c.id AND x.metric_date BETWEEN v_lo AND v_hi
    GROUP BY 1
  ),
  cut AS (
    SELECT s.platform, s.ult,
      least(v_hcut, date_trunc('hour', s.ult AT TIME ZONE p_tz)) c FROM sync s
  ),
  ev AS MATERIALIZED (
    SELECT CASE public.song_link_event_canal(g.canal, g.utm_source, g.utm_medium, g.utm_campaign)
             WHEN 'meta_ads' THEN 'meta' WHEN 'tiktok_ads' THEN 'tiktok' WHEN 'google_ads' THEN 'google' END platform,
      g.country, g.osn, g.ts, sum(g.n) n
    FROM (
      SELECT l.canal, e.utm_source, e.utm_medium, e.utm_campaign, e.country,
        CASE lower(coalesce(e.os,'')) WHEN 'android' THEN 'android' WHEN 'ios' THEN 'ios' ELSE 'outro' END osn,
        date_trunc('hour', e.created_at AT TIME ZONE p_tz) ts, count(*) n
      FROM public.song_link_events e LEFT JOIN public.song_links l ON l.id = e.link_id
      WHERE e.artist_id = p_artist_id AND e.event = 'arrival'
        AND e.created_at >= (least(v_from_ts, (v_today-1)::timestamp) AT TIME ZONE p_tz)
        AND e.created_at <  (greatest(v_to_ts, (v_today+1)::timestamp) AT TIME ZONE p_tz)
      GROUP BY 1,2,3,4,5,6,7) g
    GROUP BY 1,2,3,4
  ),
  evk AS MATERIALIZED (
    SELECT CASE public.song_link_event_canal(l.canal, e.utm_source, e.utm_medium, e.utm_campaign)
             WHEN 'meta_ads' THEN 'meta' WHEN 'tiktok_ads' THEN 'tiktok' WHEN 'google_ads' THEN 'google' END platform,
      public.artist_ads_campaign_key(e.utm_campaign) k,
      NULLIF(btrim(coalesce(e.utm_term,'')),'') ad_id,
      date_trunc('hour', e.created_at AT TIME ZONE p_tz) ts, e.country, count(*) n
    FROM public.song_link_events e LEFT JOIN public.song_links l ON l.id = e.link_id
    WHERE e.artist_id = p_artist_id AND e.event = 'arrival'
      AND e.created_at >= (least(v_from_ts, (v_today-1)::timestamp) AT TIME ZONE p_tz)
      AND e.created_at <  (greatest(v_to_ts, (v_today+1)::timestamp) AT TIME ZONE p_tz)
    GROUP BY 1,2,3,4,5
  ),
  slc AS (
    SELECT DISTINCT platform, connection_id, cid FROM (
      SELECT 'meta'::text platform, m.connection_id, m.cid
        FROM msl m JOIN evk x ON x.platform='meta' AND x.ad_id = m.ad_id
      UNION ALL
      SELECT 'meta', m.connection_id, m.cid FROM msl m WHERE m.smart
      UNION ALL
      SELECT m.platform, m.connection_id, m.cid
        FROM cmn m JOIN evk x ON x.platform = m.platform
         AND length(coalesce(x.k,'')) >= 10 AND length(coalesce(m.nkey,'')) >= 10
         AND (x.k LIKE m.nkey||'%' OR m.nkey LIKE x.k||'%' OR x.k LIKE '%'||m.nkey||'%' OR m.nkey LIKE '%'||x.k||'%')
    ) u
  ),
  h AS MATERIALIZED (
    SELECT hr.platform, hr.cur, hr.ts, coalesce(k.mc,'?') mc,
      coalesce(hr.spend_cents,0) sc, coalesce(hr.impressions,0) imp, coalesce(hr.clicks,0) clk,
      (s.platform IS NOT NULL) dest
    FROM hr LEFT JOIN cmc k ON k.platform=hr.platform AND k.connection_id=hr.connection_id AND k.cid=hr.cid
      LEFT JOIN slc s ON s.platform=hr.platform AND s.connection_id=hr.connection_id AND s.cid=hr.cid
    WHERE hr.my_rank = hr.top_rank AND (p_country IS NULL OR coalesce(k.mc,'?') = upper(p_country))
  ),
  pcur AS (SELECT platform, count(DISTINCT cur) n, min(cur) only_cur FROM h WHERE ts >= v_from_ts AND ts < v_to_ts OR ts >= (v_today-1)::timestamp GROUP BY 1),
  mccur AS (
    SELECT platform, mc, min(cur) cur FROM h GROUP BY 1,2 HAVING count(DISTINCT cur) = 1
  ),
  a AS MATERIALIZED (
    SELECT ev.platform, ev.osn, ev.ts, ev.n,
      CASE WHEN pc.n = 1 THEN pc.only_cur ELSE m.cur END cur
    FROM ev LEFT JOIN pcur pc ON pc.platform = ev.platform
      LEFT JOIN mccur m ON m.platform = ev.platform AND m.mc = upper(ev.country)
    WHERE ev.platform IS NOT NULL AND (p_country IS NULL OR upper(ev.country) = upper(p_country))
  ),
  am AS MATERIALIZED (
    SELECT x.platform, x.ts, x.n,
      CASE WHEN pc.n = 1 THEN pc.only_cur ELSE m.cur END cur,
      (CASE WHEN x.platform = 'meta' AND x.ad_id IS NOT NULL
             THEN EXISTS (SELECT 1 FROM msl mm JOIN slc s ON s.platform='meta' AND s.connection_id=mm.connection_id AND s.cid=mm.cid
                    WHERE mm.ad_id = x.ad_id)
            ELSE EXISTS (SELECT 1 FROM cmn cm JOIN slc s ON s.platform=cm.platform AND s.connection_id=cm.connection_id AND s.cid=cm.cid
                   WHERE cm.platform = x.platform AND length(coalesce(x.k,'')) >= 10 AND length(coalesce(cm.nkey,'')) >= 10
                     AND (x.k LIKE cm.nkey||'%' OR cm.nkey LIKE x.k||'%' OR x.k LIKE '%'||cm.nkey||'%' OR cm.nkey LIKE '%'||x.k||'%'))
       END) matched
    FROM evk x LEFT JOIN pcur pc ON pc.platform = x.platform
      LEFT JOIN mccur m ON m.platform = x.platform AND m.mc = upper(x.country)
    WHERE x.platform IS NOT NULL AND (p_country IS NULL OR upper(x.country) = upper(p_country))
  ),
  hv AS (
    SELECT h.platform, h.cur,
      sum(h.sc) FILTER (WHERE h.ts >= v_today::timestamp AND h.ts < ct.c)/100.0 g1,
      sum(h.imp) FILTER (WHERE h.ts >= v_today::timestamp AND h.ts < ct.c) i1,
      sum(h.clk) FILTER (WHERE h.ts >= v_today::timestamp AND h.ts < ct.c) c1,
      sum(h.sc) FILTER (WHERE h.ts >= (v_today-1)::timestamp AND h.ts < ct.c - interval '1 day')/100.0 g0,
      sum(h.imp) FILTER (WHERE h.ts >= (v_today-1)::timestamp AND h.ts < ct.c - interval '1 day') i0,
      sum(h.clk) FILTER (WHERE h.ts >= (v_today-1)::timestamp AND h.ts < ct.c - interval '1 day') c0
    FROM h JOIN cut ct ON ct.platform = h.platform
    WHERE h.ts >= (v_today-1)::timestamp GROUP BY 1,2
  ),
  av AS (
    SELECT a.platform, a.cur,
      coalesce(sum(a.n) FILTER (WHERE a.ts >= v_today::timestamp AND a.ts < ct.c),0) n1,
      coalesce(sum(a.n) FILTER (WHERE a.ts >= (v_today-1)::timestamp AND a.ts < ct.c - interval '1 day'),0) n0
    FROM a JOIN cut ct ON ct.platform = a.platform
    WHERE a.ts >= (v_today-1)::timestamp GROUP BY 1,2
  ),
  hvo AS (
    SELECT coalesce(hv.platform, av.platform) platform, coalesce(hv.cur, av.cur) cur,
      coalesce(hv.g1,0) g1, coalesce(hv.i1,0) i1, coalesce(hv.c1,0) c1, coalesce(av.n1,0) n1,
      coalesce(hv.g0,0) g0, coalesce(hv.i0,0) i0, coalesce(hv.c0,0) c0, coalesce(av.n0,0) n0
    FROM hv FULL JOIN av ON av.platform = hv.platform AND av.cur IS NOT DISTINCT FROM hv.cur
  ),
  hvm AS (
    SELECT platform, cur, g1, i1, c1, n1, g0, i0, c0, n0,
      CASE WHEN i1>0 THEN c1::numeric/i1*100 END ctr1, CASE WHEN i0>0 THEN c0::numeric/i0*100 END ctr0,
      CASE WHEN c1>0 THEN g1/c1 END cpc1, CASE WHEN c0>0 THEN g0/c0 END cpc0,
      CASE WHEN i1>0 THEN g1/i1*1000 END cpm1, CASE WHEN i0>0 THEN g0/i0*1000 END cpm0,
      CASE WHEN n1>0 THEN g1/n1 END cpa1, CASE WHEN n0>0 THEN g0/n0 END cpa0
    FROM hvo
  ),
  sh AS (
    SELECT platform, cur, ts, sum(sc)/100.0 g,
      sum(sc) FILTER (WHERE dest)/100.0 gd, sum(sc) FILTER (WHERE NOT dest)/100.0 gs,
      sum(imp) imp, sum(clk) clk FROM h
    WHERE ts >= v_from_ts AND ts < v_to_ts GROUP BY 1,2,3
  ),
  sa AS (
    SELECT platform, cur, ts, sum(n) n,
      coalesce(sum(n) FILTER (WHERE osn='android'),0) an, coalesce(sum(n) FILTER (WHERE osn='ios'),0) io, coalesce(sum(n) FILTER (WHERE osn='outro'),0) ot
    FROM a WHERE ts >= v_from_ts AND ts < v_to_ts GROUP BY 1,2,3
  ),
  sau AS (
    SELECT platform, cur, ts,
      coalesce(sum(n) FILTER (WHERE matched),0) nm, coalesce(sum(n) FILTER (WHERE NOT matched),0) nu
    FROM am WHERE ts >= v_from_ts AND ts < v_to_ts GROUP BY 1,2,3
  ),
  sho AS (
    SELECT coalesce(sh.platform, sa.platform, sau.platform) platform,
      coalesce(sh.cur, sa.cur, sau.cur) cur, coalesce(sh.ts, sa.ts, sau.ts) ts,
      coalesce(sh.g,0) g, coalesce(sh.gd,0) gd, coalesce(sh.gs,0) gs,
      coalesce(sh.imp,0) imp, coalesce(sh.clk,0) clk, coalesce(sa.n,0) n,
      coalesce(sa.an,0) an, coalesce(sa.io,0) io, coalesce(sa.ot,0) ot,
      coalesce(sau.nm,0) nm, coalesce(sau.nu,0) nu
    FROM sh FULL JOIN sa ON sa.platform=sh.platform AND sa.cur IS NOT DISTINCT FROM sh.cur AND sa.ts=sh.ts
    FULL JOIN sau ON sau.platform=coalesce(sh.platform,sa.platform)
      AND sau.cur IS NOT DISTINCT FROM coalesce(sh.cur,sa.cur) AND sau.ts=coalesce(sh.ts,sa.ts)
  ),
  bd AS (
    SELECT b.platform, coalesce(b.currency, c.selected_ad_account_currency) cur, b.connection_id, b.external_campaign_id cid,
      b.breakdown_value, b.impressions, b.clicks, b.spend_cents,
      min(CASE b.level WHEN 'campaign' THEN 1 WHEN 'adset' THEN 2 WHEN 'ad' THEN 3 ELSE 4 END)
        OVER (PARTITION BY b.connection_id, b.external_campaign_id, b.date_start, b.breakdown) top_rank,
      CASE b.level WHEN 'campaign' THEN 1 WHEN 'adset' THEN 2 WHEN 'ad' THEN 3 ELSE 4 END my_rank
    FROM crm.ads_insights_breakdown_daily b JOIN conns c ON c.id = b.connection_id
    WHERE b.breakdown = 'device' AND b.date_start BETWEEN p_from AND p_to
  ),
  dv AS (
    SELECT bd.platform, bd.cur,
      CASE WHEN bd.platform='meta' AND lower(bd.breakdown_value) LIKE 'android%' THEN 'android'
           WHEN bd.platform='meta' AND lower(bd.breakdown_value) IN ('iphone','ipad','ipod') THEN 'ios'
           ELSE 'outro' END cls,
      sum(coalesce(bd.impressions,0)) imp, sum(coalesce(bd.clicks,0)) clk, sum(coalesce(bd.spend_cents,0))/100.0 g
    FROM bd LEFT JOIN cmc k ON k.platform=bd.platform AND k.connection_id=bd.connection_id AND k.cid=bd.cid
    WHERE bd.my_rank = bd.top_rank AND (p_country IS NULL OR coalesce(k.mc,'?') = upper(p_country))
    GROUP BY 1,2,3
  ),
  da AS (
    SELECT platform, cur, osn cls, sum(n) n FROM a WHERE ts >= v_from_ts AND ts < v_to_ts GROUP BY 1,2,3
  ),
  dvo AS (
    SELECT coalesce(dv.platform, da.platform) platform, coalesce(dv.cur, da.cur) cur, coalesce(dv.cls, da.cls) cls,
      dv.imp, dv.clk, dv.g, coalesce(da.n,0) n
    FROM dv FULL JOIN da ON da.platform=dv.platform AND da.cur IS NOT DISTINCT FROM dv.cur AND da.cls=dv.cls
  ),
  per AS (
    SELECT platform, cur, sum(sc)/100.0 g FROM h WHERE ts >= v_from_ts AND ts < v_to_ts GROUP BY 1,2
  ),
  pera AS (
    SELECT platform, cur, sum(n) n FROM a WHERE ts >= v_from_ts AND ts < v_to_ts GROUP BY 1,2
  ),
  ml AS (
    SELECT coalesce(d.currency, c.selected_ad_account_currency) cur,
      sum(coalesce(d.spend_cents,0))/100.0 g,
      sum((SELECT coalesce(sum((x->>'value')::numeric),0) FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(d.actions)='array' THEN d.actions ELSE '[]'::jsonb END) x
            WHERE x->>'action_type' = 'landing_page_view')) lpv
    FROM crm.meta_campaign_insights_daily d JOIN conns c ON c.id = d.connection_id AND c.platform = 'meta'
    LEFT JOIN cmc k ON k.platform='meta' AND k.connection_id=d.connection_id AND k.cid=d.external_campaign_id
    WHERE d.date_start BETWEEN p_from AND p_to AND (p_country IS NULL OR coalesce(k.mc,'?') = upper(p_country))
    GROUP BY 1
  ),
  lp AS (
    SELECT coalesce(per.platform, pera.platform) platform, coalesce(per.cur, pera.cur) cur, per.g, coalesce(pera.n,0) n
    FROM per FULL JOIN pera ON pera.platform=per.platform AND pera.cur IS NOT DISTINCT FROM per.cur
  ),
  hrs AS (SELECT gs ts FROM generate_series(v_from_ts, least(v_to_ts, v_hcut) - interval '1 hour', interval '1 hour') gs),
  lac AS (
    SELECT ct.platform || ': ' || count(*) FILTER (WHERE hrs.ts >= ct.c OR ct.c IS NULL)
             || ' horas do período depois do último sync (' || coalesce(to_char(ct.ult AT TIME ZONE p_tz,'YYYY-MM-DD HH24:MI'),'nunca') || ')' t
      FROM cut ct CROSS JOIN hrs GROUP BY ct.platform, ct.c, ct.ult
      HAVING count(*) FILTER (WHERE hrs.ts >= ct.c OR ct.c IS NULL) > 0
    UNION ALL
    SELECT ct.platform || ': ' || count(*) || ' horas sem linhas antes do último sync (sem entrega ou leitura em falta)'
      FROM cut ct CROSS JOIN hrs
      LEFT JOIN (SELECT DISTINCT platform, ts FROM h) hp ON hp.platform = ct.platform AND hp.ts = hrs.ts
      WHERE hrs.ts < ct.c AND hp.ts IS NULL
      GROUP BY ct.platform HAVING count(*) > 0
    UNION ALL
    SELECT platform || ': moedas misturadas (' || string_agg(DISTINCT cur, ', ') || '); valores separados por moeda, nunca somados'
      FROM h WHERE ts >= v_from_ts AND ts < v_to_ts GROUP BY platform HAVING count(DISTINCT cur) > 1
    UNION ALL
    SELECT 'device só diário (no fuso da conta; atualiza às 15 e 01 UTC); google não separa android/ios (vai para outro); tiktok sem device'
      WHERE EXISTS (SELECT 1 FROM dv)
    UNION ALL
    SELECT sum(n) || ' chegadas de anúncios sem país excluídas pelo filtro p_country=' || upper(p_country)
      FROM ev WHERE p_country IS NOT NULL AND ev.platform IS NOT NULL AND ev.country IS NULL
        AND ev.ts >= v_from_ts AND ev.ts < v_to_ts HAVING sum(n) > 0
    UNION ALL
    SELECT platform || ': ' || sum(n) || ' chegadas sem moeda atribuível (país sem campanha de moeda única)'
      FROM a WHERE cur IS NULL AND ts >= v_from_ts AND ts < v_to_ts GROUP BY platform
    UNION ALL
    SELECT 'custo_por_chegada do trafego_diario = gasto das campanhas com destino ao smart link ÷ chegadas atribuídas a essas campanhas; visualizações/alcance e gasto sem destino ficam em gasto_sem_destino'
  )
  SELECT jsonb_build_object(
    'corte', jsonb_build_object('agora', to_char(v_now,'YYYY-MM-DD"T"HH24:MI:SS'), 'tz', p_tz,
      'ultima_hora_completa', to_char(v_hcut - interval '1 hour','YYYY-MM-DD"T"HH24:00'),
      'plataformas', (SELECT coalesce(jsonb_object_agg(platform, jsonb_build_object('ultimo_sync', ult,
          'corte_comparacao', to_char(c,'YYYY-MM-DD"T"HH24:00'))),'{}'::jsonb) FROM cut)),
    'hoje_vs_ontem', (SELECT coalesce(jsonb_agg(jsonb_build_object('platform',platform,'currency',cur,
        'hoje', jsonb_build_object('gasto',round(g1,2),'impressoes',i1,'cliques',c1,'chegadas',n1,
           'ctr',round(ctr1,4),'cpc',round(cpc1,4),'cpm',round(cpm1,4),'custo_por_chegada',round(cpa1,4)),
        'ontem', jsonb_build_object('gasto',round(g0,2),'impressoes',i0,'cliques',c0,'chegadas',n0,
           'ctr',round(ctr0,4),'cpc',round(cpc0,4),'cpm',round(cpm0,4),'custo_por_chegada',round(cpa0,4)),
        'delta_pct', jsonb_build_object(
           'gasto', CASE WHEN g0>0 THEN round((g1-g0)/g0*100,1) END,
           'impressoes', CASE WHEN i0>0 THEN round((i1-i0)::numeric/i0*100,1) END,
           'cliques', CASE WHEN c0>0 THEN round((c1-c0)::numeric/c0*100,1) END,
           'chegadas', CASE WHEN n0>0 THEN round((n1-n0)::numeric/n0*100,1) END,
           'ctr', CASE WHEN ctr0>0 THEN round((ctr1-ctr0)/ctr0*100,1) END,
           'cpc', CASE WHEN cpc0>0 THEN round((cpc1-cpc0)/cpc0*100,1) END,
           'cpm', CASE WHEN cpm0>0 THEN round((cpm1-cpm0)/cpm0*100,1) END,
           'custo_por_chegada', CASE WHEN cpa0>0 THEN round((cpa1-cpa0)/cpa0*100,1) END))
        ORDER BY platform, cur),'[]'::jsonb) FROM hvm),
    'serie_horaria', (SELECT coalesce(jsonb_agg(jsonb_build_object('platform',platform,'currency',cur,
        'hora', to_char(ts,'YYYY-MM-DD"T"HH24:00'),'gasto',round(g,2),'impressoes',imp,'cliques',clk,'chegadas',n,
        'chegadas_por_os', jsonb_build_object('android',an,'ios',io,'outro',ot)) ORDER BY platform, cur, ts),'[]'::jsonb) FROM sho),
    'trafego_diario', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'day',metric_day,'platform',platform,'currency',cur,
        'gasto',round(g,2),'gasto_com_destino',round(gd,2),'gasto_sem_destino',round(gs,2),
        'chegadas',n,'chegadas_sem_campanha',nu,
        'custo_por_chegada',CASE WHEN nm>0 THEN round(gd/nm,4) END)
        ORDER BY metric_day,platform,cur),'[]'::jsonb)
      FROM (SELECT ts::date AS metric_day,platform,cur,sum(g) g,sum(gd) gd,sum(gs) gs,sum(n) n,sum(nm) nm,sum(nu) nu
            FROM sho GROUP BY 1,2,3) t),
    'dispositivos', (SELECT coalesce(jsonb_agg(jsonb_build_object('platform',platform,'currency',cur,'os',cls,
        'impressoes',imp,'cliques',clk,'gasto',round(g,2),'chegadas',n,
        'custo_por_chegada', CASE WHEN n>0 AND g IS NOT NULL THEN round(g/n,4) END) ORDER BY platform, cur, cls),'[]'::jsonb) FROM dvo),
    'lpv', (SELECT coalesce(jsonb_agg(jsonb_build_object('platform',lp.platform,'currency',lp.cur,
        'lpv', CASE WHEN lp.platform='meta' THEN ml.lpv END,
        'custo_por_lpv', CASE WHEN lp.platform='meta' AND ml.lpv>0 THEN round(ml.g/ml.lpv,4) END,
        'nota', CASE WHEN lp.platform<>'meta' THEN 'plataforma não reporta LPV; usar chegadas' END,
        'chegadas', lp.n, 'custo_por_chegada', CASE WHEN lp.n>0 THEN round(lp.g/lp.n,4) END)
        ORDER BY lp.platform, lp.cur),'[]'::jsonb)
      FROM lp LEFT JOIN ml ON lp.platform='meta' AND ml.cur IS NOT DISTINCT FROM lp.cur),
    'lacunas', (SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM lac)
  ) INTO r;
  BEGIN
    r := r || jsonb_build_object('musica_daily',public.artist_song_play_origins_compare(p_artist_id,p_from,p_to));
  EXCEPTION WHEN insufficient_privilege THEN
    r := r || jsonb_build_object('musica_daily',jsonb_build_object('available',false,'reason','songs_access_required'));
  END;
  RETURN r;
END
$function$;
REVOKE ALL ON FUNCTION public.artist_ads_compare(uuid, date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_compare(uuid, date, date, text, text) TO authenticated, service_role;