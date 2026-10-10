-- Only functions: hide daily stock comparisons; preserve real campaign budget gaps.
DO $m$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.song_growth_summary(uuid,date,date)'::regprocedure);
 d:=replace(d,"metric NOT LIKE '%\_day'","metric NOT LIKE '%\_day%'");
 EXECUTE d;
 d:=pg_get_functiondef('public.artist_ads_investment_report(uuid,date,date)'::regprocedure);
 d:=replace(d,"'geo',coalesce(x.raw->'location_ids',x.raw->'geo_locations')","'geo',coalesce(x.raw->'location_ids',x.raw->'geo_locations')");
 d:=replace(d,"jsonb_build_array(jsonb_build_object('budget',g.budget_amount_micros/1000000.0,'start',g.start_date,'end',g.end_date,'state',g.status))", "jsonb_build_array(jsonb_build_object('budget',g.budget_amount_micros/1000000.0,'start',g.start_date,'end',g.end_date,'state',g.status,'geo',(SELECT jsonb_agg(x->'localizacao') FROM jsonb_array_elements(coalesce(g.settings->'criterios','[]')) x WHERE x->>'tipo'='LOCATION' AND coalesce((x->>'negativo')::boolean,false)=false)))");
 -- Aggregate daily rows to the requested account/currency grain, keeping unrounded canonical conversions.
 d:=replace(d,"v_daily:=v_report->'daily';",$r$
 SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'plataforma',plat,'conta',acc,'moeda',cur,'gasto',sp,'gasto_ref',gr,'gasto_trafego_ref',gt) ORDER BY dia,plat,acc,cur),'[]') INTO v_daily FROM
 (SELECT j->>'dia' dia,j->>'plataforma' plat,j->>'conta' acc,j->>'moeda' cur,sum((j->>'gasto')::numeric) sp,
 CASE WHEN bool_or(j->>'gasto_ref' IS NULL AND (j->>'gasto')::numeric>0) THEN NULL ELSE sum((j->>'gasto_ref')::numeric) END gr,sum((j->>'gasto_trafego_ref')::numeric) gt
 FROM jsonb_array_elements(v_report->'daily') j GROUP BY 1,2,3,4) z;
$r$);
 EXECUTE d;
END $m$;
