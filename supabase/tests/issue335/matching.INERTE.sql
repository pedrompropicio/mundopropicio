-- LOCAL/INERTE SQL port of src/lib/bp-tx-matching.ts; same explicit union and token winner.
CREATE OR REPLACE FUNCTION public.issue335_normalize(s text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_catalog AS $$
 SELECT btrim(regexp_replace(regexp_replace(lower(normalize(coalesce(s,''),NFD)),U&'[\0300-\036f]','','g'),'[^a-z0-9]+',' ','g'))
$$;
CREATE OR REPLACE FUNCTION public.issue335_score(f text,t text) RETURNS double precision LANGUAGE sql IMMUTABLE SET search_path=public,pg_catalog AS $$
 WITH n AS(SELECT issue335_normalize(f) f,issue335_normalize(t) t),
 ft AS(SELECT DISTINCT tok FROM n,regexp_split_to_table(n.f,' ') tok WHERE length(tok)>=3),
 tt AS(SELECT DISTINCT tok FROM n,regexp_split_to_table(n.t,' ') tok WHERE length(tok)>=3),
 c AS(SELECT (SELECT count(*) FROM ft JOIN tt USING(tok))::double precision shared,(SELECT count(*) FROM ft)::double precision fn)
 SELECT CASE WHEN n.f='' AND n.t='' THEN 0 WHEN n.f=n.t THEN 1000 WHEN n.f='' OR n.t='' OR c.shared=0 THEN 0 ELSE c.shared*100+c.shared/nullif(c.fn,0)*10-abs(length(n.f)-length(n.t))::double precision/10000 END FROM n,c
$$;
CREATE OR REPLACE FUNCTION public.issue335_matching_transactions(p_forecast uuid) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_catalog AS $$
 WITH f AS(SELECT f.*,e.parent_event_id master_id FROM event_forecasts f LEFT JOIN events e ON e.id=f.event_id WHERE f.id=p_forecast),
 allf AS(SELECT x.* FROM event_forecasts x,f WHERE x.company_id=f.company_id AND x.version_id IS NULL AND x.event_id IN(f.event_id,f.master_id)),
 direct AS(SELECT t.id FROM transactions t,f WHERE t.company_id=f.company_id AND (t.forecast_id=f.id OR t.id=f.transaction_id)),
 cat AS(SELECT t.id,t.description FROM transactions t,f WHERE f.category_id IS NOT NULL AND t.company_id=f.company_id AND t.event_id IN(f.event_id,f.master_id) AND t.category_id=f.category_id AND t.type=f.type AND (t.forecast_id IS NULL OR t.forecast_id=f.id) AND NOT EXISTS(SELECT 1 FROM allf x WHERE x.id<>f.id AND x.transaction_id=t.id)),
 samef AS(SELECT x.* FROM allf x,f WHERE x.category_id=f.category_id AND x.type=f.type AND x.event_id=f.event_id)
 SELECT id FROM direct UNION SELECT c.id FROM cat c,f WHERE (SELECT count(*) FROM samef)<=1 OR (issue335_score(f.description,c.description)>0 AND issue335_score(f.description,c.description)>coalesce((SELECT max(issue335_score(x.description,c.description)) FROM samef x WHERE x.id<>f.id),0))
$$;
REVOKE ALL ON FUNCTION public.issue335_normalize(text),public.issue335_score(text,text),public.issue335_matching_transactions(uuid) FROM PUBLIC,anon,authenticated;
