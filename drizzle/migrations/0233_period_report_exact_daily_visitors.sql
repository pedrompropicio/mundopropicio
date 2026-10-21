SET LOCAL lock_timeout='5s';
LOCK TABLE public.song_link_report_visitors_hourly IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE public.song_link_report_visitor_refs_daily(artist_id uuid NOT NULL,day_utc date NOT NULL,kind text NOT NULL,scope text NOT NULL,dim jsonb NOT NULL,n bigint NOT NULL DEFAULT 0 CHECK(n>=0),PRIMARY KEY(artist_id,day_utc,kind,scope,dim));
GRANT ALL ON public.song_link_report_visitor_refs_daily TO service_role;
REVOKE ALL ON public.song_link_report_visitor_refs_daily FROM PUBLIC,anon,authenticated;
ALTER TABLE public.song_link_report_visitor_refs_daily ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.song_link_report_visitor_totals_daily(artist_id uuid NOT NULL,day_utc date NOT NULL,kind text NOT NULL,scope text NOT NULL,dim jsonb NOT NULL,v bigint NOT NULL DEFAULT 0 CHECK(v>=0),PRIMARY KEY(artist_id,day_utc,kind,scope,dim));
GRANT ALL ON public.song_link_report_visitor_totals_daily TO service_role;
REVOKE ALL ON public.song_link_report_visitor_totals_daily FROM PUBLIC,anon,authenticated;
ALTER TABLE public.song_link_report_visitor_totals_daily ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.song_link_report_visitor_daily_delta(a uuid,h timestamptz,k text,d jsonb,delta bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $d$
DECLARE scope_key text;member_dim jsonb;total_dim jsonb;old_n bigint;new_n bigint;day_key date:=(h AT TIME ZONE 'UTC')::date;
BEGIN
IF delta=0 THEN RETURN;END IF;
FOREACH scope_key IN ARRAY ARRAY['all','country'] LOOP
member_dim:=CASE WHEN scope_key='country' THEN d WHEN k='campaign' THEN jsonb_build_array(d->0,d->1,NULL,d->3) ELSE jsonb_build_array(d->0,NULL,d->2) END;
total_dim:=CASE k WHEN 'campaign' THEN jsonb_build_array(member_dim->0,member_dim->1,member_dim->2) ELSE jsonb_build_array(member_dim->0,member_dim->1) END;
INSERT INTO public.song_link_report_visitor_refs_daily(artist_id,day_utc,kind,scope,dim,n) VALUES(a,day_key,k,scope_key,member_dim,0) ON CONFLICT DO NOTHING;
SELECT n INTO old_n FROM public.song_link_report_visitor_refs_daily WHERE artist_id=a AND day_utc=day_key AND kind=k AND scope=scope_key AND dim=member_dim FOR UPDATE;
new_n:=old_n+delta;
UPDATE public.song_link_report_visitor_refs_daily SET n=new_n WHERE artist_id=a AND day_utc=day_key AND kind=k AND scope=scope_key AND dim=member_dim;
IF(old_n=0 AND new_n>0) OR(old_n>0 AND new_n=0) THEN
INSERT INTO public.song_link_report_visitor_totals_daily(artist_id,day_utc,kind,scope,dim,v) VALUES(a,day_key,k,scope_key,total_dim,0) ON CONFLICT DO NOTHING;
UPDATE public.song_link_report_visitor_totals_daily SET v=v+CASE WHEN new_n>0 THEN 1 ELSE -1 END WHERE artist_id=a AND day_utc=day_key AND kind=k AND scope=scope_key AND dim=total_dim;
END IF;END LOOP;
END $d$;
CREATE FUNCTION public.song_link_report_visitor_daily_track() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $t$
BEGIN
IF TG_OP='UPDATE' AND(OLD.artist_id,OLD.hour_utc,OLD.kind,OLD.dim) IS NOT DISTINCT FROM(NEW.artist_id,NEW.hour_utc,NEW.kind,NEW.dim) THEN PERFORM public.song_link_report_visitor_daily_delta(NEW.artist_id,NEW.hour_utc,NEW.kind,NEW.dim,NEW.n-OLD.n);
ELSE
IF TG_OP<>'INSERT' THEN PERFORM public.song_link_report_visitor_daily_delta(OLD.artist_id,OLD.hour_utc,OLD.kind,OLD.dim,-OLD.n);END IF;
IF TG_OP<>'DELETE' THEN PERFORM public.song_link_report_visitor_daily_delta(NEW.artist_id,NEW.hour_utc,NEW.kind,NEW.dim,NEW.n);END IF;
END IF;RETURN NULL;
END $t$;
REVOKE ALL ON FUNCTION public.song_link_report_visitor_daily_delta(uuid,timestamptz,text,jsonb,bigint),public.song_link_report_visitor_daily_track() FROM PUBLIC,anon,authenticated;
INSERT INTO public.song_link_report_visitor_refs_daily(artist_id,day_utc,kind,scope,dim,n)
SELECT artist_id,(hour_utc AT TIME ZONE 'UTC')::date,kind,'country',dim,sum(n) FROM public.song_link_report_visitors_hourly WHERE n>0 GROUP BY 1,2,3,5
UNION ALL SELECT artist_id,(hour_utc AT TIME ZONE 'UTC')::date,kind,'all',CASE kind WHEN 'campaign' THEN jsonb_build_array(dim->0,dim->1,NULL,dim->3) ELSE jsonb_build_array(dim->0,NULL,dim->2) END,sum(n) FROM public.song_link_report_visitors_hourly WHERE n>0 GROUP BY 1,2,3,5;
INSERT INTO public.song_link_report_visitor_totals_daily(artist_id,day_utc,kind,scope,dim,v)
SELECT artist_id,day_utc,kind,scope,CASE kind WHEN 'campaign' THEN jsonb_build_array(dim->0,dim->1,dim->2) ELSE jsonb_build_array(dim->0,dim->1) END,count(*) FROM public.song_link_report_visitor_refs_daily WHERE n>0 GROUP BY 1,2,3,4,5;
CREATE TRIGGER song_link_report_visitor_daily_track AFTER INSERT OR UPDATE OR DELETE ON public.song_link_report_visitors_hourly FOR EACH ROW EXECUTE FUNCTION public.song_link_report_visitor_daily_track();
COMMENT ON TABLE public.song_link_report_visitor_refs_daily IS 'Exact daily reference counts, country and all-country scopes. NULL identities preserve legacy DISTINCT tuples. No raw IP.';
COMMENT ON TABLE public.song_link_report_visitor_totals_daily IS 'Exact visitor totals; update only on membership reference crossing zero; all-country scope deduplicates across hours/countries.';
DO $acl$ DECLARE r record; BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname='sandbox_exec' OR rolname LIKE 'sandbox_exec_%' LOOP EXECUTE format('REVOKE ALL ON TABLE public.song_link_report_visitor_refs_daily,public.song_link_report_visitor_totals_daily FROM %I',r.rolname); EXECUTE format('REVOKE ALL ON FUNCTION public.song_link_report_visitor_daily_delta(uuid,timestamptz,text,jsonb,bigint),public.song_link_report_visitor_daily_track() FROM %I',r.rolname);END LOOP;END $acl$;