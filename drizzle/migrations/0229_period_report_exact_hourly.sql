SET LOCAL lock_timeout='5s';
CREATE TABLE public.song_link_report_hourly(company_id uuid NOT NULL,artist_id uuid NOT NULL,hour_utc timestamptz NOT NULL,dim jsonb NOT NULL,n bigint NOT NULL DEFAULT 0 CHECK(n>=0),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(artist_id,hour_utc,dim));
GRANT ALL ON public.song_link_report_hourly TO service_role;
REVOKE ALL ON public.song_link_report_hourly FROM PUBLIC,anon,authenticated;
ALTER TABLE public.song_link_report_hourly ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.song_link_report_visitors_hourly(company_id uuid NOT NULL,artist_id uuid NOT NULL,hour_utc timestamptz NOT NULL,kind text NOT NULL CHECK(kind IN('campaign','channel')),dim jsonb NOT NULL,n bigint NOT NULL DEFAULT 0 CHECK(n>=0),PRIMARY KEY(artist_id,hour_utc,kind,dim));
GRANT ALL ON public.song_link_report_visitors_hourly TO service_role;
REVOKE ALL ON public.song_link_report_visitors_hourly FROM PUBLIC,anon,authenticated;
ALTER TABLE public.song_link_report_visitors_hourly ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.song_link_report_hourly_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),artist_id uuid NOT NULL,hour_utc timestamptz NOT NULL,kind text NOT NULL CHECK(kind IN('pending','reconcile')),error_code text,divergent_rows bigint,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),repaired_at timestamptz);
GRANT ALL ON public.song_link_report_hourly_log TO service_role;
REVOKE ALL ON public.song_link_report_hourly_log FROM PUBLIC,anon,authenticated;
ALTER TABLE public.song_link_report_hourly_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX song_link_report_pending_idx ON public.song_link_report_hourly_log(artist_id,hour_utc) WHERE kind='pending' AND repaired_at IS NULL;
CREATE TABLE public.song_link_report_hourly_state(artist_id uuid PRIMARY KEY,ready boolean NOT NULL DEFAULT false,verified_at timestamptz);
GRANT ALL ON public.song_link_report_hourly_state TO service_role;
REVOKE ALL ON public.song_link_report_hourly_state FROM PUBLIC,anon,authenticated;
ALTER TABLE public.song_link_report_hourly_state ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.song_link_report_hour_delta(p_event public.song_link_events,p_delta integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE h timestamptz;c text;d jsonb;k text;cnt integer;
BEGIN
h:=date_trunc('hour',p_event.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
PERFORM 1 FROM public.song_links WHERE id=p_event.link_id FOR SHARE;
SELECT public.song_link_event_canal(l.canal,p_event.utm_source,p_event.utm_medium,p_event.utm_campaign) INTO c FROM(SELECT 1)x LEFT JOIN public.song_links l ON l.id=p_event.link_id;
d:=jsonb_build_array(p_event.link_id,lower(coalesce(p_event.utm_source,'')),p_event.utm_medium,p_event.utm_campaign,p_event.country,c);
IF p_delta=1 THEN INSERT INTO public.song_link_report_hourly(company_id,artist_id,hour_utc,dim,n) VALUES(p_event.company_id,p_event.artist_id,h,d,1) ON CONFLICT(artist_id,hour_utc,dim) DO UPDATE SET n=song_link_report_hourly.n+1,company_id=excluded.company_id,updated_at=clock_timestamp();
ELSE UPDATE public.song_link_report_hourly SET n=n-1,updated_at=clock_timestamp() WHERE artist_id=p_event.artist_id AND hour_utc=h AND dim=d AND n>0; GET DIAGNOSTICS cnt=ROW_COUNT;IF cnt<>1 THEN RAISE EXCEPTION 'missing count dimension'; END IF;END IF;
FOREACH k IN ARRAY ARRAY['campaign','channel'] LOOP
 d:=CASE k WHEN 'campaign' THEN jsonb_build_array(lower(coalesce(p_event.utm_source,'')),p_event.utm_campaign,p_event.country,p_event.ip_hash) ELSE jsonb_build_array(c,p_event.country,p_event.ip_hash) END;
 IF p_delta=1 THEN INSERT INTO public.song_link_report_visitors_hourly(company_id,artist_id,hour_utc,kind,dim,n) VALUES(p_event.company_id,p_event.artist_id,h,k,d,1) ON CONFLICT(artist_id,hour_utc,kind,dim) DO UPDATE SET n=song_link_report_visitors_hourly.n+1,company_id=excluded.company_id;
 ELSE UPDATE public.song_link_report_visitors_hourly SET n=n-1 WHERE artist_id=p_event.artist_id AND hour_utc=h AND kind=k AND dim=d AND n>0;GET DIAGNOSTICS cnt=ROW_COUNT;IF cnt<>1 THEN RAISE EXCEPTION 'missing visitor dimension';END IF;END IF;
END LOOP;
END $f$;
CREATE FUNCTION public.song_link_report_hourly_track() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE vo boolean:=false;vn boolean:=false;oh timestamptz;nh timestamptz;ks bigint[];k bigint;timeout_old text;err text;
BEGIN
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
CREATE TRIGGER song_link_report_hourly_track AFTER INSERT OR UPDATE OR DELETE ON public.song_link_events FOR EACH ROW EXECUTE FUNCTION public.song_link_report_hourly_track();
CREATE FUNCTION public.song_link_report_link_track() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN
IF OLD.canal IS NOT DISTINCT FROM NEW.canal THEN RETURN NULL;END IF;
INSERT INTO public.song_link_report_hourly_log(artist_id,hour_utc,kind,error_code) SELECT DISTINCT artist_id,hour_utc,'pending','link_channel_changed' FROM public.song_link_report_hourly WHERE dim->>0=NEW.id::text AND n>0;RETURN NULL;
EXCEPTION WHEN OTHERS THEN
BEGIN UPDATE public.song_link_report_hourly_state SET ready=false WHERE artist_id IN(SELECT DISTINCT artist_id FROM public.song_link_report_hourly WHERE dim->>0=NEW.id::text);EXCEPTION WHEN OTHERS THEN RAISE WARNING 'report link invalidation failed (%); link retained',SQLSTATE;END;
RAISE WARNING 'report link tracking failed (%); link retained',SQLSTATE;RETURN NULL;
END $f$;
CREATE INDEX song_link_report_link_idx ON public.song_link_report_hourly((dim->>0));
CREATE TRIGGER song_link_report_link_track AFTER UPDATE OF canal ON public.song_links FOR EACH ROW EXECUTE FUNCTION public.song_link_report_link_track();
CREATE FUNCTION public.song_link_report_hourly_rebuild(p_artist uuid,p_from timestamptz,p_to timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE h timestamptz;ids uuid[];diff bigint;total bigint:=0;hours integer:=0;
BEGIN
IF session_user<>'postgres' AND coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501';END IF;
IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from OR p_to-p_from>interval '24 hours' OR p_from<>date_trunc('hour',p_from AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' OR p_to<>date_trunc('hour',p_to AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' THEN RAISE EXCEPTION 'bounded whole UTC hours required';END IF;
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
REVOKE ALL ON FUNCTION public.song_link_report_hour_delta(public.song_link_events,integer),public.song_link_report_hourly_track(),public.song_link_report_link_track(),public.song_link_report_hourly_rebuild(uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.song_link_report_hourly_rebuild(uuid,timestamptz,timestamptz) TO service_role;
COMMENT ON TABLE public.song_link_report_hourly IS 'dim=[link_id,lower(coalesce(source,empty)),medium,raw campaign,nullable country,effective channel]. Exact UTC hourly counts; original events retained.';
COMMENT ON TABLE public.song_link_report_visitors_hourly IS 'Exact reference counts. campaign dim=[source,campaign,country,ip_hash]; channel dim=[channel,country,ip_hash]. Daily cross-hour/country DISTINCT tuples including NULL hashes as legacy. No raw IP.';
CREATE OR REPLACE FUNCTION public.song_link_arrivals_hourly_reconcile() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_end timestamptz:=date_trunc('hour',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'+interval '1 hour';r record;v_result jsonb;v_total bigint:=0;v_hours bigint:=0;
BEGIN
IF current_user<>'postgres' AND coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501';END IF;
FOR r IN SELECT DISTINCT x.artist_id,x.hu FROM(SELECT artists.id artist_id,gs hu FROM public.artists CROSS JOIN LATERAL generate_series(v_end-interval '73 hours',v_end-interval '1 hour',interval '1 hour') gs WHERE EXISTS(SELECT 1 FROM public.song_link_events e WHERE e.artist_id=artists.id AND e.event='arrival') UNION ALL SELECT artist_id,hour_utc FROM public.song_link_report_hourly_log WHERE kind='pending' AND repaired_at IS NULL UNION ALL SELECT artist_id,hour_utc FROM public.song_link_arrivals_hourly_log WHERE kind='pending' AND repaired_at IS NULL AND artist_id IS NOT NULL)x ORDER BY x.artist_id,x.hu LOOP
v_result:=public.song_link_arrivals_hourly_rebuild(r.artist_id,r.hu,r.hu+interval '1 hour');v_total:=v_total+(v_result->>'divergent_rows')::bigint;
v_result:=public.song_link_report_hourly_rebuild(r.artist_id,r.hu,r.hu+interval '1 hour');v_total:=v_total+(v_result->>'divergent_rows')::bigint;v_hours:=v_hours+1;
END LOOP;RETURN jsonb_build_object('hours',v_hours,'divergent_rows',v_total);
END $fn$;
CREATE FUNCTION public.song_link_report_hourly_validate(p_artist uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $v$
DECLARE d bigint;src_n bigint;agg_n bigint;pending bigint;
BEGIN
IF session_user<>'postgres' AND coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service only' USING ERRCODE='42501';END IF;
WITH src AS MATERIALIZED(SELECT e.company_id,e.artist_id,date_trunc('hour',e.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' h,jsonb_build_array(e.link_id,lower(coalesce(e.utm_source,'')),e.utm_medium,e.utm_campaign,e.country,public.song_link_event_canal(l.canal,e.utm_source,e.utm_medium,e.utm_campaign)) dim,lower(coalesce(e.utm_source,'')) source,e.utm_campaign,e.country,e.ip_hash,public.song_link_event_canal(l.canal,e.utm_source,e.utm_medium,e.utm_campaign) canal FROM public.song_link_events e LEFT JOIN public.song_links l ON l.id=e.link_id WHERE e.artist_id=p_artist AND e.event='arrival'),
counts AS(SELECT company_id,artist_id,h,dim,count(*) n FROM src GROUP BY 1,2,3,4),
members AS(SELECT company_id,artist_id,h,'campaign'::text kind,jsonb_build_array(source,utm_campaign,country,ip_hash) dim,count(*) n FROM src GROUP BY 1,2,3,5 UNION ALL SELECT company_id,artist_id,h,'channel',jsonb_build_array(canal,country,ip_hash),count(*) FROM src GROUP BY 1,2,3,5),
dif AS(SELECT 1 FROM counts s FULL JOIN(SELECT * FROM public.song_link_report_hourly WHERE artist_id=p_artist AND n>0)a ON(s.artist_id,s.h,s.dim)=(a.artist_id,a.hour_utc,a.dim) WHERE coalesce(s.n,0)<>coalesce(a.n,0) OR s.company_id IS DISTINCT FROM a.company_id UNION ALL SELECT 1 FROM members s FULL JOIN(SELECT * FROM public.song_link_report_visitors_hourly WHERE artist_id=p_artist AND n>0)a ON(s.artist_id,s.h,s.kind,s.dim)=(a.artist_id,a.hour_utc,a.kind,a.dim) WHERE coalesce(s.n,0)<>coalesce(a.n,0) OR s.company_id IS DISTINCT FROM a.company_id)
SELECT(SELECT count(*) FROM dif),(SELECT count(*) FROM src),(SELECT coalesce(sum(n),0) FROM public.song_link_report_hourly WHERE artist_id=p_artist),(SELECT count(*) FROM public.song_link_report_hourly_log WHERE artist_id=p_artist AND kind='pending' AND repaired_at IS NULL) INTO d,src_n,agg_n,pending;
INSERT INTO public.song_link_report_hourly_state(artist_id,ready,verified_at) VALUES(p_artist,d=0 AND pending=0,clock_timestamp()) ON CONFLICT(artist_id) DO UPDATE SET ready=excluded.ready,verified_at=excluded.verified_at;
RETURN jsonb_build_object('source',src_n,'aggregate',agg_n,'divergent_rows',d,'pending',pending,'ready',d=0 AND pending=0);
END $v$;
REVOKE ALL ON FUNCTION public.song_link_report_hourly_validate(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.song_link_report_hourly_validate(uuid) TO service_role;
DO $acl$ DECLARE r record;t text;f text;BEGIN
FOR r IN SELECT rolname FROM pg_roles WHERE rolname='sandbox_exec' OR rolname LIKE 'sandbox_exec_%' LOOP
FOREACH t IN ARRAY ARRAY['song_link_report_hourly','song_link_report_visitors_hourly','song_link_report_hourly_log','song_link_report_hourly_state'] LOOP EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',t,r.rolname);END LOOP;
FOREACH f IN ARRAY ARRAY['public.song_link_report_hour_delta(public.song_link_events,integer)','public.song_link_report_hourly_track()','public.song_link_report_link_track()','public.song_link_report_hourly_rebuild(uuid,timestamptz,timestamptz)','public.song_link_report_hourly_validate(uuid)'] LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f,r.rolname);END LOOP;END LOOP;
IF EXISTS(SELECT 1 FROM pg_roles role_check CROSS JOIN(VALUES('public.song_link_report_hourly'),('public.song_link_report_visitors_hourly'),('public.song_link_report_hourly_log'),('public.song_link_report_hourly_state'))t(n) WHERE(role_check.rolname IN('anon','authenticated','sandbox_exec') OR role_check.rolname LIKE 'sandbox_exec_%') AND has_table_privilege(role_check.oid,t.n,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) THEN RAISE EXCEPTION 'report aggregate ACL failure';END IF;
END $acl$;