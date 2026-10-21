SET LOCAL lock_timeout = '5s';
CREATE FUNCTION public.artist_ads_compare(p_artist_id uuid, p_from date, p_to date, p_country text DEFAULT NULL::text, p_tz text DEFAULT 'America/Sao_Paulo'::text)
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
  h AS MATERIALIZED (
    SELECT hr.platform, hr.cur, hr.ts, coalesce(k.mc,'?') mc,
      coalesce(hr.spend_cents,0) sc, coalesce(hr.impressions,0) imp, coalesce(hr.clicks,0) clk
    FROM hr LEFT JOIN cmc k ON k.platform=hr.platform AND k.connection_id=hr.connection_id AND k.cid=hr.cid
    WHERE hr.my_rank = hr.top_rank AND (p_country IS NULL OR coalesce(k.mc,'?') = upper(p_country))
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
  pcur AS (SELECT platform, count(DISTINCT cur) n, min(cur) only_cur FROM h WHERE ts >= v_from_ts AND ts < v_to_ts OR ts >= (v_today-1)::timestamp GROUP BY 1),
  mccur AS (
    SELECT platform, mc, min(cur) cur FROM h GROUP BY 1,2 HAVING count(DISTINCT cur) = 1
  ),
  ev AS MATERIALIZED (
    SELECT CASE public.song_link_event_canal(l.canal, e.utm_source, e.utm_medium, e.utm_campaign)
             WHEN 'meta_ads' THEN 'meta' WHEN 'tiktok_ads' THEN 'tiktok' WHEN 'google_ads' THEN 'google' END platform,
      e.country, CASE lower(coalesce(e.os,'')) WHEN 'android' THEN 'android' WHEN 'ios' THEN 'ios' ELSE 'outro' END osn,
      e.created_at AT TIME ZONE p_tz ts
    FROM public.song_link_events e LEFT JOIN public.song_links l ON l.id = e.link_id
    WHERE e.artist_id = p_artist_id AND e.event = 'arrival'
      AND e.created_at >= (least(v_from_ts, (v_today-1)::timestamp) AT TIME ZONE p_tz)
      AND e.created_at <  (greatest(v_to_ts, (v_today+1)::timestamp) AT TIME ZONE p_tz)
  ),
  a AS MATERIALIZED (
    SELECT ev.platform, ev.osn, ev.ts,
      CASE WHEN pc.n = 1 THEN pc.only_cur ELSE m.cur END cur
    FROM ev LEFT JOIN pcur pc ON pc.platform = ev.platform
      LEFT JOIN mccur m ON m.platform = ev.platform AND m.mc = upper(ev.country)
    WHERE ev.platform IS NOT NULL AND (p_country IS NULL OR upper(ev.country) = upper(p_country))
  ),
  -- hoje vs ontem
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
      count(*) FILTER (WHERE a.ts >= v_today::timestamp AND a.ts < ct.c) n1,
      count(*) FILTER (WHERE a.ts >= (v_today-1)::timestamp AND a.ts < ct.c - interval '1 day') n0
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
  -- série horária
  sh AS (
    SELECT platform, cur, ts, sum(sc)/100.0 g, sum(imp) imp, sum(clk) clk FROM h
    WHERE ts >= v_from_ts AND ts < v_to_ts GROUP BY 1,2,3
  ),
  sa AS (
    SELECT platform, cur, date_trunc('hour', ts) ts, count(*) n,
      count(*) FILTER (WHERE osn='android') an, count(*) FILTER (WHERE osn='ios') io, count(*) FILTER (WHERE osn='outro') ot
    FROM a WHERE ts >= v_from_ts AND ts < v_to_ts GROUP BY 1,2,3
  ),
  sho AS (
    SELECT coalesce(sh.platform, sa.platform) platform, coalesce(sh.cur, sa.cur) cur, coalesce(sh.ts, sa.ts) ts,
      coalesce(sh.g,0) g, coalesce(sh.imp,0) imp, coalesce(sh.clk,0) clk, coalesce(sa.n,0) n,
      coalesce(sa.an,0) an, coalesce(sa.io,0) io, coalesce(sa.ot,0) ot
    FROM sh FULL JOIN sa ON sa.platform=sh.platform AND sa.cur IS NOT DISTINCT FROM sh.cur AND sa.ts=sh.ts
  ),
  -- dispositivos
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
    SELECT platform, cur, osn cls, count(*) n FROM a WHERE ts >= v_from_ts AND ts < v_to_ts GROUP BY 1,2,3
  ),
  dvo AS (
    SELECT coalesce(dv.platform, da.platform) platform, coalesce(dv.cur, da.cur) cur, coalesce(dv.cls, da.cls) cls,
      dv.imp, dv.clk, dv.g, coalesce(da.n,0) n
    FROM dv FULL JOIN da ON da.platform=dv.platform AND da.cur IS NOT DISTINCT FROM dv.cur AND da.cls=dv.cls
  ),
  -- LPV
  per AS (
    SELECT platform, cur, sum(sc)/100.0 g FROM h WHERE ts >= v_from_ts AND ts < v_to_ts GROUP BY 1,2
  ),
  pera AS (
    SELECT platform, cur, count(*) n FROM a WHERE ts >= v_from_ts AND ts < v_to_ts GROUP BY 1,2
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
  -- lacunas
  hrs AS (SELECT gs ts FROM generate_series(v_from_ts, least(v_to_ts, v_hcut) - interval '1 hour', interval '1 hour') gs),
  lac AS (
    SELECT ct.platform || ': ' || count(*) FILTER (WHERE hrs.ts >= ct.c OR ct.c IS NULL)
             || ' horas do período depois do último sync (' || coalesce(to_char(ct.ult AT TIME ZONE p_tz,'YYYY-MM-DD HH24:MI'),'nunca') || ')' t
      FROM cut ct CROSS JOIN hrs GROUP BY ct.platform, ct.c, ct.ult
      HAVING count(*) FILTER (WHERE hrs.ts >= ct.c OR ct.c IS NULL) > 0
    UNION ALL
    SELECT ct.platform || ': ' || count(*) || ' horas sem linhas antes do último sync (sem entrega ou leitura em falta)'
      FROM cut ct CROSS JOIN hrs
      WHERE hrs.ts < ct.c AND NOT EXISTS (SELECT 1 FROM h WHERE h.platform = ct.platform AND h.ts = hrs.ts)
      GROUP BY ct.platform HAVING count(*) > 0
    UNION ALL
    SELECT platform || ': moedas misturadas (' || string_agg(DISTINCT cur, ', ') || '); valores separados por moeda, nunca somados'
      FROM h WHERE ts >= v_from_ts AND ts < v_to_ts GROUP BY platform HAVING count(DISTINCT cur) > 1
    UNION ALL
    SELECT 'device só diário (no fuso da conta; atualiza às 15 e 01 UTC); google não separa android/ios (vai para outro); tiktok sem device'
      WHERE EXISTS (SELECT 1 FROM dv)
    UNION ALL
    SELECT count(*) || ' chegadas de anúncios sem país excluídas pelo filtro p_country=' || upper(p_country)
      FROM ev WHERE p_country IS NOT NULL AND ev.platform IS NOT NULL AND ev.country IS NULL
        AND ev.ts >= v_from_ts AND ev.ts < v_to_ts HAVING count(*) > 0
    UNION ALL
    SELECT platform || ': ' || count(*) || ' chegadas sem moeda atribuível (país sem campanha de moeda única)'
      FROM a WHERE cur IS NULL AND ts >= v_from_ts AND ts < v_to_ts GROUP BY platform
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
  RETURN r;
END
$function$;
REVOKE ALL ON FUNCTION public.artist_ads_compare(uuid, date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_compare(uuid, date, date, text, text) TO authenticated, service_role;