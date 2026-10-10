-- D-ERP236 adenda: projeção completa. Só CREATE OR REPLACE FUNCTION (via EXECUTE), sem tabelas.
DO $mig$
DECLARE d text := pg_get_functiondef('public.artist_ads_investment_report(uuid,date,date)'::regprocedure); o text; n text;
BEGIN
 o:=$q$=false))),g.budget_amount_micros/1000000.0$q$; n:=$q$=false))),coalesce(g.budget_amount_micros/1000000.0,CASE WHEN g.end_date IS NOT NULL AND g.end_date>=current_date AND (g.raw->'campaignBudget'->>'totalAmountMicros') IS NOT NULL THEN round(greatest(0,(g.raw->'campaignBudget'->>'totalAmountMicros')::numeric/1000000.0-coalesce((SELECT sum(gi.spend_cents)/100.0 FROM crm.google_campaign_insights_daily gi WHERE gi.connection_id=g.connection_id AND gi.external_campaign_id=g.external_campaign_id AND gi.date_start<=current_date),0))/greatest(1,g.end_date-current_date),2) END)$q$;
 IF position(o in d)=0 THEN RAISE EXCEPTION 'D-ERP236 adenda: trecho em falta'; END IF; d:=replace(d,o,n);
 o:=$q$coalesce(l.ends,(SELECT max((p->>'end')::date) FROM jsonb_array_elements(l.parts) p)) end_date,$q$; n:=$q$CASE WHEN coalesce(l.ends,(SELECT max((p->>'end')::date) FROM jsonb_array_elements(l.parts) p))>current_date+365 THEN NULL ELSE coalesce(l.ends,(SELECT max((p->>'end')::date) FROM jsonb_array_elements(l.parts) p)) END end_date,$q$;
 IF position(o in d)=0 THEN RAISE EXCEPTION 'D-ERP236 adenda: trecho em falta'; END IF; d:=replace(d,o,n);
 o:=$q$least(coalesce((p->>'end')::date,(s->>'end_date')::date,$q$; n:=$q$least(coalesce(CASE WHEN (p->>'end')::date>current_date+365 THEN NULL ELSE (p->>'end')::date END,(s->>'end_date')::date,$q$;
 IF position(o in d)=0 THEN RAISE EXCEPTION 'D-ERP236 adenda: trecho em falta'; END IF; d:=replace(d,o,n);
 o:=$q$'orcamento_dia',(c->>'daily_budget')::numeric,$q$; n:=$q$'orcamento_dia',(c->>'daily_budget')::numeric,'orcamento_tipo',CASE WHEN c->>'daily_budget' IS NULL THEN NULL WHEN c->>'platform'='google' AND coalesce(c->'raw'->'campaignBudget'->>'period','DAILY')<>'DAILY' THEN 'derivado' ELSE 'diario' END,$q$;
 IF position(o in d)=0 THEN RAISE EXCEPTION 'D-ERP236 adenda: trecho em falta'; END IF; d:=replace(d,o,n);
 o:=$q$CASE WHEN bool_or(missing) THEN NULL ELSE coalesce(sum(amount),0) END INTO v_projection,v_projected$q$; n:=$q$coalesce(round(sum(amount),2),0) INTO v_projection,v_projected$q$;
 IF position(o in d)=0 THEN RAISE EXCEPTION 'D-ERP236 adenda: trecho em falta'; END IF; d:=replace(d,o,n);
 o:=$q$CASE WHEN bool_or(c->>'orcamento_dia' IS NULL OR public.fx_convert((c->>'orcamento_dia')::numeric,c->>'moeda',v_ref,current_date) IS NULL) THEN NULL
 ELSE round(sum((SELECT$q$; n:=$q$round(sum((SELECT$q$;
 IF position(o in d)=0 THEN RAISE EXCEPTION 'D-ERP236 adenda: trecho em falta'; END IF; d:=replace(d,o,n);
 o:=$q$LIMIT 1)),2) END amount,$q$; n:=$q$LIMIT 1)) FILTER (WHERE c->>'orcamento_dia' IS NOT NULL AND public.fx_convert((c->>'orcamento_dia')::numeric,c->>'moeda',v_ref,current_date) IS NOT NULL),2) amount,$q$;
 IF position(o in d)=0 THEN RAISE EXCEPTION 'D-ERP236 adenda: trecho em falta'; END IF; d:=replace(d,o,n);
 o:=$q$ -- Seven series.$q$; n:=$q$ SELECT coalesce(jsonb_agg(jsonb_build_object('plataforma',c->>'plataforma','campanha',c->>'campanha','motivo',CASE WHEN c->>'orcamento_dia' IS NULL THEN 'orcamento_desconhecido' ELSE 'cambio_indisponivel' END)),'[]') INTO v_missing
 FROM jsonb_array_elements(v_active) c WHERE c->>'orcamento_dia' IS NULL OR public.fx_convert((c->>'orcamento_dia')::numeric,c->>'moeda',v_ref,current_date) IS NULL;
 -- Seven series.$q$;
 IF position(o in d)=0 THEN RAISE EXCEPTION 'D-ERP236 adenda: trecho em falta'; END IF; d:=replace(d,o,n);
 o:=$q$v_projection jsonb;$q$; n:=$q$v_projection jsonb; v_missing jsonb;$q$;
 IF position(o in d)=0 THEN RAISE EXCEPTION 'D-ERP236 adenda: trecho em falta'; END IF; d:=replace(d,o,n);
 o:=$q$'total_projetado_ref',v_projected,'total_mes_ref',v_month+v_projected,$q$; n:=$q$'total_projetado_ref',coalesce(v_projected,0),'total_mes_ref',round(coalesce(v_month,0)+coalesce(v_projected,0),2),'parcial',jsonb_array_length(coalesce(v_missing,'[]'))>0 OR v_month IS NULL,'em_falta',coalesce(v_missing,'[]'),$q$;
 IF position(o in d)=0 THEN RAISE EXCEPTION 'D-ERP236 adenda: trecho em falta'; END IF; d:=replace(d,o,n);
 EXECUTE d;
END $mig$;
REVOKE ALL ON FUNCTION public.artist_ads_investment_report(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_investment_report(uuid,date,date) TO authenticated;