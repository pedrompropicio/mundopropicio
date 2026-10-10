-- D-ERP236: project each active daily budget leg to its own end date.
DO $m$ DECLARE d text; anchor text; replacement text; BEGIN
 d:=pg_get_functiondef('public.artist_ads_investment_report(uuid,date,date)'::regprocedure);
 anchor:=$a$AND coalesce((c->>'start_date')::date,current_date)<=current_date AND coalesce((c->>'end_date')::date,current_date)>=current_date;$a$;
 replacement:=$a$AND coalesce((c->>'start_date')::date,current_date)<=current_date AND coalesce((c->>'end_date')::date,current_date)>=current_date
 AND (jsonb_array_length(c->'parts')=0 OR EXISTS (SELECT 1 FROM jsonb_array_elements(c->'parts') p WHERE upper(p->>'state') IN ('ACTIVE','ENABLED','ENABLE','CAMPAIGN_STATUS_ENABLE') AND coalesce((p->>'start')::date,current_date)<=current_date AND coalesce((p->>'end')::date,current_date)>=current_date));$a$;
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'D-ERP236: active anchor absent'; END IF;
 d:=replace(d,anchor,replacement);
 anchor:=$a$ELSE sum(public.fx_convert((c->>'orcamento_dia')::numeric,c->>'moeda',v_ref,current_date)*(c->>'dias_projecao')::integer) END amount,$a$;
 replacement:=$a$ELSE round(sum((SELECT CASE WHEN (s->>'campaign_budget')::numeric>0 THEN public.fx_convert((c->>'orcamento_dia')::numeric,c->>'moeda',v_ref,current_date)*(c->>'dias_projecao')::integer
 ELSE (SELECT sum(public.fx_convert((p->>'budget')::numeric,c->>'moeda',v_ref,current_date)*greatest(0,least(coalesce((p->>'end')::date,(s->>'end_date')::date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date),(date_trunc('month',current_date)+interval '1 month - 1 day')::date)-current_date)) FROM jsonb_array_elements(s->'parts') p WHERE upper(p->>'state') IN ('ACTIVE','ENABLED','ENABLE','CAMPAIGN_STATUS_ENABLE') AND coalesce((p->>'start')::date,current_date)<=current_date AND coalesce((p->>'end')::date,current_date)>=current_date) END FROM jsonb_array_elements(v_campaigns) s WHERE s->>'platform'=c->>'plataforma' AND s->>'nome'=c->>'campanha' LIMIT 1)),2) END amount,$a$;
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'D-ERP236: projection anchor absent'; END IF;
 d:=replace(d,anchor,replacement);
 -- If one active leg has no daily budget, do not silently project only the other legs.
 anchor:=$a$coalesce(nullif(l.campaign_budget,0),(SELECT sum((p->>'budget')::numeric)$a$;
 replacement:=$a$coalesce(nullif(l.campaign_budget,0),(SELECT CASE WHEN bool_or(p->>'budget' IS NULL) THEN NULL ELSE sum((p->>'budget')::numeric) END$a$;
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'D-ERP236: budget anchor absent'; END IF;
 d:=replace(d,anchor,replacement);
 EXECUTE d;
END $m$;
