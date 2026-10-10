-- D-ERP236: derive a slim projection from the canonical function's CTEs.
-- No changes to artist_ads_period_report; no duplicated source logic for spend/traffic.
DO $m$ DECLARE d text; pre text; cm text; cls text; tail text; BEGIN
 d:=pg_get_functiondef('public.artist_ads_period_report(uuid,date,date,text)'::regprocedure);
 pre:=split_part(split_part(d,'  WITH conns AS (',2),'  ev AS MATERIALIZED (',1);
 cm:=split_part(split_part(d,'  cm AS (',2),'  agg AS (',1);
 cls:=split_part(split_part(d,'  camp2 AS (',2),'      ch.n chegadas, ch.v visitantes',1);
 cls:=split_part(cls,'    SELECT cp.*,',2);
 pre:='WITH conns AS ('||pre;
 cm:='cm AS ('||cm;
 tail:=$tail$
 agg0 AS (SELECT platform,connection_id,cid,round(sum(spend_ref),2) gasto_ref,min(dia) d FROM cdr GROUP BY 1,2,3),
 classified AS (SELECT cp.*, $tail$||cls||$tail$ NULL::numeric unused FROM (SELECT a.*,m.nome,m.objetivo,m.otimizacao FROM agg0 a LEFT JOIN cm m ON m.platform=a.platform AND m.connection_id=a.connection_id AND m.cid=a.cid) cp),
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
 RETURN v_out; END $fn$;
$tail$;
 EXECUTE 'CREATE OR REPLACE FUNCTION public._artist_ads_investment_source(p_artist_id uuid,p_from date,p_to date,p_country text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public,crm,pg_catalog AS $fn$ DECLARE v_company uuid; v_ref text; v_out jsonb; BEGIN v_company:=public.artist_ads_assert_access(p_artist_id); SELECT coalesce(a.reporting_currency,c.currency,''EUR'') INTO v_ref FROM public.artists a LEFT JOIN public.companies c ON c.id=a.company_id WHERE a.id=p_artist_id; '||pre||cm||tail;
END $m$;
REVOKE ALL ON FUNCTION public._artist_ads_investment_source(uuid,date,date,text) FROM PUBLIC,anon,authenticated;
DO $m$ DECLARE d text; start_pos int; end_pos int; BEGIN
 d:=pg_get_functiondef('public.artist_ads_investment_report(uuid,date,date)'::regprocedure);
 d:=replace(d,'v_report:=public.artist_ads_period_report(p_artist_id,v_from,v_to);','v_report:=public._artist_ads_investment_source(p_artist_id,v_from,v_to);');
 start_pos:=strpos(d,' -- Account-level daily rows;');
 end_pos:=strpos(d,' SELECT coalesce(jsonb_agg(jsonb_build_object(''moeda'',currency');
 d:=substring(d for start_pos-1)||$r$
 v_daily:=v_report->'daily';
 IF date_trunc('month',current_date)::date>=v_from AND current_date<=v_to THEN
 SELECT CASE WHEN bool_or(j->>'gasto_ref' IS NULL AND (j->>'gasto')::numeric>0) THEN NULL ELSE coalesce(round(sum((j->>'gasto_ref')::numeric),2),0) END INTO v_month FROM jsonb_array_elements(v_daily) j WHERE (j->>'dia')::date BETWEEN date_trunc('month',current_date)::date AND current_date;
 ELSE
 DECLARE month_report jsonb; BEGIN month_report:=public._artist_ads_investment_source(p_artist_id,date_trunc('month',current_date)::date,current_date);
 SELECT CASE WHEN bool_or(j->>'gasto_ref' IS NULL AND (j->>'gasto')::numeric>0) THEN NULL ELSE coalesce(round(sum((j->>'gasto_ref')::numeric),2),0) END INTO v_month FROM jsonb_array_elements(month_report->'daily') j; END;
 END IF;
$r$||substring(d from end_pos);
 start_pos:=strpos(d,'    WITH ev AS (');end_pos:=strpos(substring(d from start_pos),'    SELECT v_from d,')+start_pos-1;
 d:=substring(d for start_pos-1)||$r$
    WITH arr AS (SELECT (j->>'d')::date d,(j->>'v')::numeric n FROM jsonb_array_elements(v_report->'arrivals_daily') j),
    tr AS (SELECT (j->>'dia')::date d,sum((j->>'gasto_trafego_ref')::numeric) spend FROM jsonb_array_elements(v_daily) j GROUP BY 1)
    SELECT coalesce(jsonb_agg(jsonb_build_object('d',d,'v',CASE WHEN spec.chave='chegadas_spotify' THEN n ELSE CASE WHEN n>0 THEN round(spend/n,4) END END) ORDER BY d),'[]') INTO pts FROM arr LEFT JOIN tr USING(d);
$r$||substring(d from end_pos);
 EXECUTE d;
END $m$;
