SET LOCAL lock_timeout = '5s';
-- Atomic fencing: the control lock stays held until the entire batch commits.
CREATE FUNCTION public.artist_ads_refresh_write(p_artist_id uuid,p_request_id uuid,p_connection_id uuid,p_rows jsonb,p_device boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, crm
AS $fn$
DECLARE v_control public.artist_ads_refresh_control%ROWTYPE; v_conn record; v_row jsonb; v_count integer:=0;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'writer reservado ao serviço' USING ERRCODE='42501'; END IF;
  IF p_device IS NULL OR p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>500
    OR octet_length(p_rows::text)>4000000 THEN RAISE EXCEPTION 'batch inválido'; END IF;
  SELECT * INTO v_control FROM public.artist_ads_refresh_control WHERE artist_id=p_artist_id FOR UPDATE;
  IF NOT FOUND OR p_request_id IS NULL OR v_control.request_id IS DISTINCT FROM p_request_id
    OR v_control.lease_until IS NULL OR v_control.lease_until<=clock_timestamp() THEN
    RETURN jsonb_build_object('accepted',false,'reason','stale_request');
  END IF;
  SELECT id,company_id,artist_id,platform,selected_ad_account_id,status,connection_scope
    INTO v_conn FROM crm.ad_platform_connections WHERE id=p_connection_id FOR SHARE;
  IF NOT FOUND OR v_conn.company_id IS DISTINCT FROM v_control.company_id OR v_conn.artist_id IS DISTINCT FROM p_artist_id
    OR v_conn.status<>'active' OR v_conn.connection_scope<>'artist' OR v_conn.selected_ad_account_id IS NULL THEN
    RAISE EXCEPTION 'ligação fora do pedido' USING ERRCODE='42501';
  END IF;
  IF p_device AND v_conn.platform<>'meta' THEN RAISE EXCEPTION 'device só Meta'; END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(v_row)<>'object' OR v_row->>'level' IS NULL OR (v_row->>'level') NOT IN ('campaign','adset')
      OR nullif(btrim(v_row->>'external_campaign_id'),'') IS NULL
      OR nullif(v_row->>'metric_date','') IS NULL OR nullif(v_row->>'account_timezone','') IS NULL
      OR (v_row->>'currency') !~ '^[A-Z]{3}$' OR v_row->>'currency' IS NULL
      OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=v_row->>'account_timezone')
      OR ((v_row->>'level')='adset' AND nullif(btrim(v_row->>'external_adset_id'),'') IS NULL)
      OR ((v_row->>'level')='campaign' AND coalesce(v_row->>'external_adset_id','')<>'')
      OR (v_row->>'metric_date')::date > (clock_timestamp() AT TIME ZONE (v_row->>'account_timezone'))::date
      OR (v_row->>'metric_date')::date < (clock_timestamp() AT TIME ZONE (v_row->>'account_timezone'))::date-29
      OR jsonb_typeof(coalesce(v_row->'raw','{}'::jsonb))<>'object'
      OR octet_length(coalesce(v_row->'raw','{}'::jsonb)::text)>8192
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(coalesce(v_row->'raw','{}'::jsonb)) k
        WHERE k NOT IN ('breakdown_source','cost_micros','source_level','device_os')) THEN
      RAISE EXCEPTION 'linha inválida';
    END IF;
    IF p_device THEN
      -- Legacy NOT NULL counters: absence is rejected, never coerced to zero.
      IF v_row->>'impressions' IS NULL OR v_row->>'clicks' IS NULL OR v_row->>'spend_cents' IS NULL
        OR nullif(btrim(v_row->>'breakdown_value'),'') IS NULL
        OR (v_row->>'impressions')::bigint<0 OR (v_row->>'clicks')::bigint<0 OR (v_row->>'spend_cents')::bigint<0 THEN
        RAISE EXCEPTION 'device incompleto';
      END IF;
      INSERT INTO crm.ads_insights_breakdown_daily(company_id,connection_id,platform,level,external_campaign_id,
        external_adset_id,external_ad_id,date_start,breakdown,breakdown_value,impressions,clicks,spend_cents,currency,source,raw,last_synced_at)
      VALUES(v_control.company_id,p_connection_id,'meta',v_row->>'level',v_row->>'external_campaign_id',
        coalesce(v_row->>'external_adset_id',''),'',(v_row->>'metric_date')::date,'device',v_row->>'breakdown_value',
        (v_row->>'impressions')::bigint,(v_row->>'clicks')::bigint,(v_row->>'spend_cents')::bigint,v_row->>'currency','api',coalesce(v_row->'raw','{}'::jsonb),clock_timestamp())
      ON CONFLICT(connection_id,platform,level,external_campaign_id,external_adset_id,external_ad_id,date_start,breakdown,breakdown_value)
      DO UPDATE SET impressions=EXCLUDED.impressions,clicks=EXCLUDED.clicks,spend_cents=EXCLUDED.spend_cents,
        currency=EXCLUDED.currency,source=EXCLUDED.source,raw=EXCLUDED.raw,last_synced_at=EXCLUDED.last_synced_at;
    ELSE
      INSERT INTO crm.ads_insights_hourly(company_id,connection_id,platform,ad_account_id,level,external_campaign_id,
        external_adset_id,account_timezone,metric_date,metric_hour,spend_cents,impressions,clicks,currency,raw,last_synced_at)
      VALUES(v_control.company_id,p_connection_id,v_conn.platform,v_conn.selected_ad_account_id,v_row->>'level',v_row->>'external_campaign_id',
        coalesce(v_row->>'external_adset_id',''),v_row->>'account_timezone',(v_row->>'metric_date')::date,(v_row->>'metric_hour')::smallint,
        (v_row->>'spend_cents')::bigint,(v_row->>'impressions')::bigint,(v_row->>'clicks')::bigint,v_row->>'currency',coalesce(v_row->'raw','{}'::jsonb),clock_timestamp())
      ON CONFLICT(connection_id,platform,ad_account_id,account_timezone,level,external_campaign_id,external_adset_id,metric_date,metric_hour)
      DO UPDATE SET spend_cents=EXCLUDED.spend_cents,impressions=EXCLUDED.impressions,clicks=EXCLUDED.clicks,
        currency=EXCLUDED.currency,raw=EXCLUDED.raw,last_synced_at=EXCLUDED.last_synced_at;
    END IF;
    v_count:=v_count+1;
  END LOOP;
  RETURN jsonb_build_object('accepted',true,'rows_written',v_count);
END $fn$;
REVOKE ALL ON FUNCTION public.artist_ads_refresh_write(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.artist_ads_refresh_write(uuid,uuid,uuid,jsonb,boolean) TO service_role;
DO $acl$
DECLARE acl_role record;
BEGIN
  FOR acl_role IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'sandbox_exec%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.artist_ads_refresh_write(uuid,uuid,uuid,jsonb,boolean) FROM %I',acl_role.rolname);
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles role_check WHERE (role_check.rolname IN ('anon','authenticated') OR role_check.rolname LIKE 'sandbox_exec%')
    AND has_function_privilege(role_check.oid,'public.artist_ads_refresh_write(uuid,uuid,uuid,jsonb,boolean)','EXECUTE')) THEN
    RAISE EXCEPTION 'writer: EXECUTE inesperado';
  END IF;
END $acl$;
