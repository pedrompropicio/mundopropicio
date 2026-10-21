SET LOCAL lock_timeout = '5s';
DO $pre$ BEGIN
 IF to_regclass('public.song_link_arrivals_hourly') IS NOT NULL OR to_regclass('public.song_link_arrivals_hourly_log') IS NOT NULL THEN
  RAISE EXCEPTION 'arrivals_hourly: objects already exist';
 END IF;
END $pre$;
CREATE TABLE public.song_link_arrivals_hourly (
 company_id uuid NOT NULL, artist_id uuid NOT NULL, hour_utc timestamptz NOT NULL,
 canal text NOT NULL, country text NOT NULL DEFAULT '?', os text NOT NULL,
 n bigint NOT NULL DEFAULT 0 CHECK(n>=0), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(artist_id,hour_utc,canal,country,os),
 CHECK(hour_utc = date_trunc('hour',hour_utc AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
 CHECK(os IN ('android','ios','outro'))
);
GRANT ALL ON public.song_link_arrivals_hourly TO service_role;
REVOKE ALL ON public.song_link_arrivals_hourly FROM PUBLIC,anon,authenticated;
ALTER TABLE public.song_link_arrivals_hourly ENABLE ROW LEVEL SECURITY;
CREATE INDEX song_link_arrivals_hourly_artist_hour_idx ON public.song_link_arrivals_hourly(artist_id,hour_utc);
CREATE TABLE public.song_link_arrivals_hourly_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), artist_id uuid, hour_utc timestamptz,
 kind text NOT NULL CHECK(kind IN ('pending','reconcile')), error_code text,
 divergent_rows bigint, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), repaired_at timestamptz
);
GRANT ALL ON public.song_link_arrivals_hourly_log TO service_role;
REVOKE ALL ON public.song_link_arrivals_hourly_log FROM PUBLIC,anon,authenticated;
ALTER TABLE public.song_link_arrivals_hourly_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX song_link_arrivals_hourly_pending_idx ON public.song_link_arrivals_hourly_log(artist_id,hour_utc) WHERE kind='pending' AND repaired_at IS NULL;

CREATE FUNCTION public.song_link_arrivals_hour_key(p_artist uuid,p_hour timestamptz)
RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path=pg_catalog
AS $$ SELECT hashtextextended('song_link_arrivals_hourly:'||p_artist::text||':'||(extract(epoch FROM p_hour)::bigint)::text,0) $$;

CREATE FUNCTION public.song_link_arrivals_hour_delta(p_event public.song_link_events,p_delta integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_hour timestamptz; v_canal text; v_country text; v_os text; v_count integer;
BEGIN
 v_hour:=date_trunc('hour',p_event.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 SELECT public.song_link_event_canal(l.canal,p_event.utm_source,p_event.utm_medium,p_event.utm_campaign)
 INTO v_canal FROM (SELECT 1) x LEFT JOIN public.song_links l ON l.id=p_event.link_id;
 v_country:=coalesce(p_event.country,'?');
 v_os:=CASE lower(coalesce(p_event.os,'')) WHEN 'android' THEN 'android' WHEN 'ios' THEN 'ios' ELSE 'outro' END;
 IF p_delta=1 THEN
  INSERT INTO public.song_link_arrivals_hourly(company_id,artist_id,hour_utc,canal,country,os,n)
  VALUES(p_event.company_id,p_event.artist_id,v_hour,v_canal,v_country,v_os,1)
  ON CONFLICT(artist_id,hour_utc,canal,country,os) DO UPDATE SET company_id=excluded.company_id,n=song_link_arrivals_hourly.n+1,updated_at=clock_timestamp();
 ELSE
  UPDATE public.song_link_arrivals_hourly SET n=n-1,updated_at=clock_timestamp()
  WHERE artist_id=p_event.artist_id AND hour_utc=v_hour AND canal=v_canal AND country=v_country AND os=v_os AND n>0;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'arrivals_hourly: missing old dimension' USING ERRCODE='P0002'; END IF;
 END IF;
END $fn$;

CREATE FUNCTION public.song_link_arrivals_hourly_track()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_old boolean:=false; v_new boolean:=false; v_oh timestamptz; v_nh timestamptz;
 v_keys bigint[]; v_key bigint; v_timeout text; v_error text;
BEGIN
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
CREATE TRIGGER song_link_arrivals_hourly_track AFTER INSERT OR UPDATE OR DELETE ON public.song_link_events
FOR EACH ROW EXECUTE FUNCTION public.song_link_arrivals_hourly_track();

CREATE FUNCTION public.song_link_arrivals_hourly_rebuild(p_artist uuid,p_from timestamptz,p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_hour timestamptz; v_ids uuid[]; v_diff bigint; v_total bigint:=0; v_hours integer:=0;
BEGIN
 IF current_user<>'postgres' AND coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from OR p_to-p_from>interval '24 hours'
 OR p_from<>date_trunc('hour',p_from AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
 OR p_to<>date_trunc('hour',p_to AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' THEN RAISE EXCEPTION 'bounded whole-hour range required'; END IF;
 FOR v_hour IN SELECT generate_series(p_from,p_to-interval '1 hour',interval '1 hour') LOOP
  PERFORM pg_advisory_xact_lock(public.song_link_arrivals_hour_key(p_artist,v_hour));
  -- Capture exact pending IDs BEFORE the source snapshot. Never acknowledge newer commits.
  SELECT array_agg(id) INTO v_ids FROM public.song_link_arrivals_hourly_log
   WHERE artist_id=p_artist AND hour_utc=v_hour AND kind='pending' AND repaired_at IS NULL;
  WITH src AS MATERIALIZED (
   SELECT e.company_id,e.artist_id,public.song_link_event_canal(l.canal,e.utm_source,e.utm_medium,e.utm_campaign) canal,
    coalesce(e.country,'?') country,CASE lower(coalesce(e.os,'')) WHEN 'android' THEN 'android' WHEN 'ios' THEN 'ios' ELSE 'outro' END os,count(*)::bigint n
   FROM public.song_link_events e LEFT JOIN public.song_links l ON l.id=e.link_id
   WHERE e.artist_id=p_artist AND e.event='arrival' AND e.created_at>=v_hour AND e.created_at<v_hour+interval '1 hour'
   GROUP BY 1,2,3,4,5
  ), old AS MATERIALIZED(SELECT * FROM public.song_link_arrivals_hourly WHERE artist_id=p_artist AND hour_utc=v_hour),
  diff AS(SELECT count(*) n FROM src s FULL JOIN old o USING(artist_id,canal,country,os)
    WHERE coalesce(s.n,0)<>coalesce(o.n,0) OR (s.n IS NOT NULL AND o.n IS NOT NULL AND s.company_id IS DISTINCT FROM o.company_id)),
  removed AS(DELETE FROM public.song_link_arrivals_hourly o WHERE o.artist_id=p_artist AND o.hour_utc=v_hour
    AND NOT EXISTS(SELECT 1 FROM src s WHERE s.canal=o.canal AND s.country=o.country AND s.os=o.os) RETURNING 1),
  written AS(INSERT INTO public.song_link_arrivals_hourly(company_id,artist_id,hour_utc,canal,country,os,n)
    SELECT company_id,artist_id,v_hour,canal,country,os,n FROM src
    ON CONFLICT(artist_id,hour_utc,canal,country,os) DO UPDATE SET company_id=excluded.company_id,n=excluded.n,updated_at=clock_timestamp()
    RETURNING 1)
  SELECT n INTO v_diff FROM diff;
  UPDATE public.song_link_arrivals_hourly_log SET repaired_at=clock_timestamp() WHERE id=ANY(coalesce(v_ids,ARRAY[]::uuid[]));
  INSERT INTO public.song_link_arrivals_hourly_log(artist_id,hour_utc,kind,divergent_rows) VALUES(p_artist,v_hour,'reconcile',v_diff);
  v_total:=v_total+v_diff; v_hours:=v_hours+1;
 END LOOP;
 RETURN jsonb_build_object('hours',v_hours,'divergent_rows',v_total);
END $fn$;

CREATE FUNCTION public.song_link_arrivals_hourly_reconcile()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_end timestamptz:=date_trunc('hour',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'+interval '1 hour';
 r record; v_result jsonb; v_total bigint:=0; v_hours bigint:=0;
BEGIN
 IF current_user<>'postgres' AND coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501'; END IF;
 FOR r IN
  SELECT DISTINCT x.artist_id,x.hu FROM (
   SELECT artists.id artist_id,gs hu FROM public.artists CROSS JOIN LATERAL generate_series(v_end-interval '73 hours',v_end-interval '1 hour',interval '1 hour') gs
   WHERE EXISTS(SELECT 1 FROM public.song_link_events e WHERE e.artist_id=artists.id AND e.event='arrival')
   UNION ALL SELECT artist_id,hour_utc FROM public.song_link_arrivals_hourly_log WHERE kind='pending' AND repaired_at IS NULL AND artist_id IS NOT NULL
  ) x ORDER BY x.artist_id,x.hu
 LOOP
  v_result:=public.song_link_arrivals_hourly_rebuild(r.artist_id,r.hu,r.hu+interval '1 hour');
  v_total:=v_total+(v_result->>'divergent_rows')::bigint; v_hours:=v_hours+1;
 END LOOP;
 RETURN jsonb_build_object('hours',v_hours,'divergent_rows',v_total);
END $fn$;
-- UTC buckets preserve raw arrival counts including teste. No distinct visitors/IPs.
COMMENT ON TABLE public.song_link_arrivals_hourly IS 'Canonical hourly arrival counts, UTC; includes teste; NULL country encoded as ?. OS: lower(android)=android, lower(ios)=ios, all other/NULL=outro. Failed or contended updates logged for bounded nightly repair. No visitor identifiers.';
REVOKE ALL ON FUNCTION public.song_link_arrivals_hour_key(uuid,timestamptz),public.song_link_arrivals_hour_delta(public.song_link_events,integer),public.song_link_arrivals_hourly_track(),public.song_link_arrivals_hourly_rebuild(uuid,timestamptz,timestamptz),public.song_link_arrivals_hourly_reconcile() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.song_link_arrivals_hourly_rebuild(uuid,timestamptz,timestamptz),public.song_link_arrivals_hourly_reconcile() TO service_role;
DO $acl$ DECLARE r record; t text; f text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname='sandbox_exec' OR rolname LIKE 'sandbox_exec_%' LOOP
  FOREACH t IN ARRAY ARRAY['public.song_link_arrivals_hourly','public.song_link_arrivals_hourly_log'] LOOP EXECUTE format('REVOKE ALL ON TABLE %s FROM %I',t,r.rolname); END LOOP;
  FOREACH f IN ARRAY ARRAY['public.song_link_arrivals_hour_key(uuid,timestamptz)','public.song_link_arrivals_hour_delta(public.song_link_events,integer)','public.song_link_arrivals_hourly_track()','public.song_link_arrivals_hourly_rebuild(uuid,timestamptz,timestamptz)','public.song_link_arrivals_hourly_reconcile()'] LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f,r.rolname); END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles rr WHERE (rr.rolname IN('anon','authenticated','sandbox_exec') OR rr.rolname LIKE 'sandbox_exec_%')
 AND (has_table_privilege(rr.oid,'public.song_link_arrivals_hourly','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_table_privilege(rr.oid,'public.song_link_arrivals_hourly_log','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))
 THEN RAISE EXCEPTION 'arrivals_hourly: unexpected effective table ACL'; END IF;
END $acl$;