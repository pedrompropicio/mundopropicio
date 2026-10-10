-- Only functions: hide daily stock comparisons; preserve real campaign budget gaps.
DO $m$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.song_growth_summary(uuid,date,date)'::regprocedure);
 d:=replace(d,$a$metric NOT LIKE '%\_day'$a$,$a$metric NOT LIKE '%\_day%'$a$);
 -- Retain the canonical visible S4A metric set, rather than reintroducing hidden twins.
 d:=replace(d,$a$AND metric_date<=p_to GROUP BY metric,platform$a$,$a$AND metric_date<=p_to AND EXISTS (SELECT 1 FROM jsonb_array_elements(v->'grupos') g,jsonb_array_elements(g->'linhas') l WHERE l->>'indicador'=metric) GROUP BY metric,platform$a$);
 -- The legacy weekly key is retained for existing callers, but its value is explicitly the selected-period flow.
 d:=replace(d,$a$'atual',ln->'atual','delta',ln->'delta'$a$,$a$'atual',CASE WHEN kp->>'chave'='streams_semana' THEN ln->'delta' ELSE ln->'atual' END,'delta',ln->'delta'$a$);
 EXECUTE d;
 d:=pg_get_functiondef('public.artist_ads_investment_report(uuid,date,date)'::regprocedure);
 d:=replace(d,$a$jsonb_build_array(jsonb_build_object('budget',g.budget_amount_micros/1000000.0,'start',g.start_date,'end',g.end_date,'state',g.status))$a$, $a$jsonb_build_array(jsonb_build_object('budget',g.budget_amount_micros/1000000.0,'start',g.start_date,'end',g.end_date,'state',g.status,'geo',(SELECT jsonb_agg(x->'localizacao') FROM jsonb_array_elements(coalesce(g.settings->'criterios','[]')) x WHERE x->>'tipo'='LOCATION' AND coalesce((x->>'negativo')::boolean,false)=false)))$a$);
 -- Aggregate daily rows to the requested account/currency grain, keeping unrounded canonical conversions.
 d:=replace(d,$a$v_daily:=v_report->'daily';$a$,$r$
 SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'plataforma',plat,'conta',acc,'moeda',cur,'gasto',sp,'gasto_ref',gr,'gasto_trafego_ref',gt) ORDER BY dia,plat,acc,cur),'[]') INTO v_daily FROM
 (SELECT j->>'dia' dia,j->>'plataforma' plat,j->>'conta' acc,j->>'moeda' cur,sum((j->>'gasto')::numeric) sp,
 CASE WHEN bool_or(j->>'gasto_ref' IS NULL AND (j->>'gasto')::numeric>0) THEN NULL ELSE sum((j->>'gasto_ref')::numeric) END gr,sum((j->>'gasto_trafego_ref')::numeric) gt
 FROM jsonb_array_elements(v_report->'daily') j GROUP BY 1,2,3,4) z;
$r$);
 EXECUTE d;
END $m$;
