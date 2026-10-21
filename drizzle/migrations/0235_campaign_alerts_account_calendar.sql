SET lock_timeout='5s';
DO $migration$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('public.artist_ads_alerts(uuid)'::regprocedure) INTO d;
 IF position('c.start_date <= current_date - 2' in d)=0 THEN RAISE EXCEPTION 'Unexpected alerts definition'; END IF;
 d:=replace(d,'SELECT c.* FROM crm.ad_platform_connections c, guard g','SELECT c.*, (now() AT TIME ZONE coalesce(c.oauth_meta->>''account_timezone'', (SELECT h.account_timezone FROM crm.ads_insights_hourly h WHERE h.connection_id=c.id ORDER BY h.last_synced_at DESC LIMIT 1)))::date AS today, coalesce(c.oauth_meta->>''account_timezone'', (SELECT h.account_timezone FROM crm.ads_insights_hourly h WHERE h.connection_id=c.id ORDER BY h.last_synced_at DESC LIMIT 1)) AS tz FROM crm.ad_platform_connections c, guard g');
 d:=replace(d,'camp AS (SELECT * FROM public.artist_ads_campaigns(p_artist_id, false)),','camp AS (
 SELECT ''google''::text platform,g.connection_id,g.external_campaign_id campaign_id,g.name campaign_name,g.status,g.start_date,g.end_date,c.today FROM crm.google_campaign g JOIN conns c ON c.id=g.connection_id WHERE c.platform=''google''
 UNION ALL
 SELECT ''meta'',m.connection_id,m.external_campaign_id,m.name,coalesce(m.effective_status,m.status),(m.start_time AT TIME ZONE c.tz)::date,(m.stop_time AT TIME ZONE c.tz)::date,c.today FROM crm.meta_campaign_snapshot m JOIN conns c ON c.id=m.connection_id WHERE c.platform=''meta''
 ),');
 d:=replace(d,'i.external_campaign_id AS campaign_id,','i.external_campaign_id AS campaign_id, i.connection_id,');
 d:=replace(d,'WHERE i.connection_id IN (SELECT id FROM conns WHERE platform=''google'')
      AND i.date_start >= current_date - 6','JOIN conns c ON c.id=i.connection_id AND c.platform=''google''
    WHERE i.date_start BETWEEN c.today - 6 AND c.today');
 d:=replace(d,'SELECT ''meta'', i.external_campaign_id, sum(i.impressions)','SELECT ''meta'', i.external_campaign_id, i.connection_id, sum(i.impressions)');
 d:=replace(d,'WHERE i.connection_id IN (SELECT id FROM conns WHERE platform=''meta'')
      AND i.date_start >= current_date - 6','JOIN conns c ON c.id=i.connection_id AND c.platform=''meta''
    WHERE i.date_start BETWEEN c.today - 6 AND c.today');
 d:=replace(d,'GROUP BY 1,2','GROUP BY 1,2,3');
 d:=replace(d,'i.campaign_id = c.campaign_id','i.campaign_id = c.campaign_id AND i.connection_id = c.connection_id');
 d:=replace(d,'c.start_date <= current_date - 2','c.start_date <= c.today - 2
    AND (c.end_date IS NULL OR c.end_date >= c.today)');
 EXECUTE d;
 SELECT pg_get_functiondef('crm.artist_ads_tiktok_alerts_core(uuid)'::regprocedure) INTO d;
 IF position('WHERE a.cst IN' in d)=0 THEN RAISE EXCEPTION 'Unexpected TikTok definition'; END IF;
 d:=replace(d,'upper(coalesce(g.status,'''')) AS gst,','upper(coalesce(g.status,'''')) AS gst,
      ((g.raw->>''schedule_start_time'')::timestamp AT TIME ZONE ''UTC'' AT TIME ZONE c.tz)::date AS start_day,
      ((g.raw->>''schedule_end_time'')::timestamp AT TIME ZONE ''UTC'' AT TIME ZONE c.tz)::date AS end_day,');
 d:=replace(d,'WHERE a.cst IN (''ENABLE'',''ACTIVE'') AND a.gst IN (''ENABLE'',''ACTIVE'')','WHERE a.cst IN (''ENABLE'',''ACTIVE'') AND a.gst IN (''ENABLE'',''ACTIVE'')
      AND a.start_day <= d.today AND (a.end_day IS NULL OR a.end_day >= d.today)');
 EXECUTE d;
END $migration$;