SET LOCAL lock_timeout='5s';
DO $opt$ DECLARE d text;a integer;b integer;BEGIN
 d:=pg_get_functiondef('public.song_link_report_arrivals(uuid,date,date,text)'::regprocedure);
 a:=position('members AS MATERIALIZED' IN d);b:=position('ca AS(' IN d);IF a=0 OR b<=a THEN RAISE EXCEPTION 'visitor reader drift';END IF;
 d:=substring(d FROM 1 FOR a-1)||'members AS MATERIALIZED(SELECT r.kind,r.dim,r.v FROM public.song_link_report_visitor_totals_daily r WHERE r.artist_id=p_artist_id AND r.day_utc BETWEEN p_from AND p_to AND r.scope=CASE WHEN p_country IS NULL THEN ''all'' ELSE ''country'' END AND r.v>0 AND(p_country IS NULL OR upper(CASE r.kind WHEN ''campaign'' THEN r.dim->>2 ELSE r.dim->>1 END)=upper(p_country))),
'||substring(d FROM b);
 d:=replace(d,'SELECT z.src,z.campaign,count(*) v FROM(SELECT DISTINCT m.dim->>0 src,m.dim->>1 campaign,m.dia,m.dim->>3 ip_hash FROM members m WHERE m.kind=''campaign'')z GROUP BY 1,2','SELECT m.dim->>0 src,m.dim->>1 campaign,sum(m.v)::bigint v FROM members m WHERE m.kind=''campaign'' GROUP BY 1,2');
 d:=replace(d,'SELECT z.canal,count(*)v FROM(SELECT DISTINCT m.dim->>0 canal,m.dia,m.dim->>2 ip_hash FROM members m WHERE m.kind=''channel'')z GROUP BY 1','SELECT m.dim->>0 canal,sum(m.v)::bigint v FROM members m WHERE m.kind=''channel'' GROUP BY 1');
 IF position('m.dia' IN substring(d FROM 1 FOR position('ELSE' IN substring(d FROM position('UNION ALL SELECT ''channel''' IN d)))+position('UNION ALL SELECT ''channel''' IN d)))>0 THEN RAISE EXCEPTION 'visitor replacement incomplete';END IF;
 EXECUTE d;
END $opt$;