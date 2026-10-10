-- D-ERP236: apenas funções; relatório canónico intocado, câmbio BCE do próprio dia.
CREATE OR REPLACE FUNCTION public.artist_ads_investment_report(p_artist_id uuid,p_from date DEFAULT NULL,p_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','crm','pg_catalog' AS $fn$
DECLARE
 v_company uuid; v_ref text; v_from date; v_to date:=coalesce(p_to,current_date); v_start date;
 v_report jsonb; v_daily jsonb; v_campaigns jsonb; v_active jsonb; v_projection jsonb; v_totals jsonb; v_fx jsonb;
 v_kpis jsonb:='[]'; v_series jsonb:='[]'; v_marks jsonb; spec record; v_base record; v_current record; pts jsonb;
 v_spend numeric; v_arrivals numeric; v_traffic numeric; v_streams numeric; v_projected numeric; v_month numeric;
BEGIN
 v_company:=public.artist_ads_assert_access(p_artist_id);
 SELECT coalesce(a.reporting_currency,c.currency,'EUR') INTO v_ref FROM public.artists a LEFT JOIN public.companies c ON c.id=a.company_id WHERE a.id=p_artist_id;
 -- Campaign schedule and active budget legs. Never treat lifetime budgets as daily budgets.
 WITH conns AS (SELECT * FROM crm.ad_platform_connections WHERE artist_id=p_artist_id AND company_id=v_company AND connection_scope='artist'),
 legs AS (
 SELECT 'meta'::text platform,c.selected_ad_account_id account,c.selected_ad_account_currency currency,s.external_campaign_id cid,s.name nome,s.objective objective,
  coalesce(s.effective_status,s.status) status,
  coalesce(s.start_time,(SELECT min(start_time) FROM crm.meta_adset_snapshot WHERE connection_id=s.connection_id AND external_campaign_id=s.external_campaign_id))::date starts,
  coalesce(s.stop_time,(SELECT max(end_time) FROM crm.meta_adset_snapshot WHERE connection_id=s.connection_id AND external_campaign_id=s.external_campaign_id))::date ends,
  s.market_country country,s.raw,
  coalesce((SELECT jsonb_agg(jsonb_build_object('budget',x.daily_budget_cents/100.0,'start',x.start_time::date,'end',x.end_time::date,'state',coalesce(x.effective_status,x.status),'geo',x.targeting->'geo_locations')) FROM crm.meta_adset_snapshot x WHERE x.connection_id=s.connection_id AND x.external_campaign_id=s.external_campaign_id),'[]'::jsonb) parts,
  s.daily_budget_cents/100.0 campaign_budget
 FROM crm.meta_campaign_snapshot s JOIN conns c ON c.id=s.connection_id
 UNION ALL
 SELECT 'google',c.selected_ad_account_id,c.selected_ad_account_currency,g.external_campaign_id,g.name,g.advertising_channel_type,g.status,g.start_date,g.end_date,g.market_country,g.raw,
  jsonb_build_array(jsonb_build_object('budget',g.budget_amount_micros/1000000.0,'start',g.start_date,'end',g.end_date,'state',g.status)),g.budget_amount_micros/1000000.0
 FROM crm.google_campaign g JOIN conns c ON c.id=g.connection_id
 UNION ALL
 SELECT 'tiktok',c.selected_ad_account_id,coalesce(t.currency,c.selected_ad_account_currency),t.external_campaign_id,t.name,t.objective,t.status,
  coalesce(substring(t.raw->>'start_time' from '^\d{4}-\d{2}-\d{2}'),substring(t.raw->>'create_time' from '^\d{4}-\d{2}-\d{2}'))::date,
  substring(t.raw->>'end_time' from '^\d{4}-\d{2}-\d{2}')::date,t.market_country,t.raw,
  coalesce((SELECT jsonb_agg(jsonb_build_object('budget',CASE WHEN coalesce(x.raw->>'budget_mode','BUDGET_MODE_DAY') IN ('BUDGET_MODE_DAY','BUDGET_MODE_DYNAMIC_DAILY_BUDGET') THEN x.budget_cents/100.0 END,
    'start',substring(coalesce(x.raw->>'schedule_start_time',x.raw->>'start_time') from '^\d{4}-\d{2}-\d{2}'),
    'end',substring(coalesce(x.raw->>'schedule_end_time',x.raw->>'end_time') from '^\d{4}-\d{2}-\d{2}'),'state',x.status,'geo',coalesce(x.raw->'location_ids',x.raw->'geo_locations')))
   FROM crm.tiktok_adgroup x WHERE x.connection_id=t.connection_id AND x.external_campaign_id=t.external_campaign_id),'[]'::jsonb),
  CASE WHEN t.raw->>'budget_mode' IN ('BUDGET_MODE_DAY','BUDGET_MODE_DYNAMIC_DAILY_BUDGET') THEN nullif(t.budget_cents,0)/100.0 END
 FROM crm.tiktok_campaign t JOIN conns c ON c.id=t.connection_id
 ), normalized AS (
 SELECT l.*,coalesce(l.starts,substring(l.nome from '(\d{4}-\d{2}-\d{2})')::date) start_date,
 coalesce(l.ends,(SELECT max((p->>'end')::date) FROM jsonb_array_elements(l.parts) p)) end_date,
 coalesce(nullif(l.campaign_budget,0),(SELECT sum((p->>'budget')::numeric) FROM jsonb_array_elements(l.parts) p WHERE upper(p->>'state') IN ('ACTIVE','ENABLED','ENABLE','CAMPAIGN_STATUS_ENABLE') AND coalesce((p->>'start')::date,current_date)<=current_date AND coalesce((p->>'end')::date,current_date)>=current_date)) daily_budget
 FROM legs l)
 SELECT coalesce(jsonb_agg(to_jsonb(n)),'[]') INTO v_campaigns FROM normalized n;
 SELECT min((c->>'start_date')::date) INTO v_start FROM jsonb_array_elements(v_campaigns) c WHERE c->>'nome' ~* '^\s*\[mp\]';
 -- If schedule is absent, the first actual [MP] insight is the honest management start.
 IF v_start IS NULL THEN
  SELECT min(d) INTO v_start FROM (
   SELECT i.date_start d FROM crm.meta_campaign_insights_daily i JOIN crm.meta_campaign_snapshot s USING(connection_id,external_campaign_id) JOIN crm.ad_platform_connections c ON c.id=i.connection_id WHERE c.artist_id=p_artist_id AND c.company_id=v_company AND s.name ~* '^\s*\[mp\]'
   UNION ALL SELECT i.date_start FROM crm.google_campaign_insights_daily i JOIN crm.google_campaign s USING(connection_id,external_campaign_id) JOIN crm.ad_platform_connections c ON c.id=i.connection_id WHERE c.artist_id=p_artist_id AND c.company_id=v_company AND s.name ~* '^\s*\[mp\]'
   UNION ALL SELECT i.date_start FROM crm.tiktok_insights_daily i JOIN crm.tiktok_campaign s USING(connection_id,external_campaign_id) JOIN crm.ad_platform_connections c ON c.id=i.connection_id WHERE c.artist_id=p_artist_id AND c.company_id=v_company AND s.name ~* '^\s*\[mp\]') z;
 END IF;
 v_from:=coalesce(p_from,v_start,v_to);
 IF v_from>v_to THEN RAISE EXCEPTION 'período inválido' USING ERRCODE='22023'; END IF;
 v_report:=public.artist_ads_period_report(p_artist_id,v_from,v_to);
 -- Totals, traffic objective classification and arrivals come from D-ERP185, not a new interpretation.
 SELECT coalesce(sum((c->>'gasto_ref')::numeric),0) INTO v_spend FROM jsonb_array_elements(v_report->'plataformas') p,jsonb_array_elements(p->'campanhas') c;
 IF (v_report->'totais'->>'fx_missing_days')::integer>0 THEN v_spend:=NULL; END IF;
 SELECT coalesce(sum((p->>'gasto_trafego')::numeric),0),coalesce(sum((p->>'chegadas')::numeric),0) INTO v_traffic,v_arrivals FROM jsonb_array_elements(v_report->'plataformas') p;
 SELECT jsonb_agg(jsonb_build_object('plataforma',p->>'platform','gasto_ref',(SELECT sum((c->>'gasto_ref')::numeric) FROM jsonb_array_elements(p->'campanhas') c),
 'pct',CASE WHEN v_spend>0 THEN round((SELECT sum((c->>'gasto_ref')::numeric) FROM jsonb_array_elements(p->'campanhas') c)/v_spend*100,2) END,'campanhas',jsonb_array_length(p->'campanhas'))) INTO v_totals FROM jsonb_array_elements(v_report->'plataformas') p;
 -- Account-level daily rows; same campaign/adgroup precedence and one canonical FX call per daily campaign.
 WITH conns AS (SELECT * FROM crm.ad_platform_connections WHERE artist_id=p_artist_id AND company_id=v_company AND connection_scope='artist'),
 tl AS (SELECT i.*,bool_or(i.level='campaign') OVER(PARTITION BY i.connection_id,i.external_campaign_id,i.date_start) has_c FROM crm.tiktok_insights_daily i JOIN conns c ON c.id=i.connection_id WHERE i.level IN ('campaign','adgroup') AND i.date_start BETWEEN least(v_from,date_trunc('month',current_date)::date) AND greatest(v_to,current_date)),
 cd AS (
 SELECT 'meta'::text platform,c.selected_ad_account_id account,i.external_campaign_id cid,i.date_start d,coalesce(i.currency,c.selected_ad_account_currency) currency,i.spend_cents/100.0 spend FROM crm.meta_campaign_insights_daily i JOIN conns c ON c.id=i.connection_id AND c.platform='meta' WHERE i.date_start BETWEEN least(v_from,date_trunc('month',current_date)::date) AND greatest(v_to,current_date)
 UNION ALL SELECT 'google',c.selected_ad_account_id,i.external_campaign_id,i.date_start,coalesce(i.currency,c.selected_ad_account_currency),i.spend_cents/100.0 FROM crm.google_campaign_insights_daily i JOIN conns c ON c.id=i.connection_id AND c.platform='google' WHERE i.date_start BETWEEN least(v_from,date_trunc('month',current_date)::date) AND greatest(v_to,current_date)
 UNION ALL SELECT 'tiktok',c.selected_ad_account_id,i.external_campaign_id,i.date_start,coalesce(max(i.currency),max(c.selected_ad_account_currency)),sum(i.spend_cents)/100.0 FROM tl i JOIN conns c ON c.id=i.connection_id WHERE (i.has_c AND i.level='campaign') OR (NOT i.has_c AND i.level='adgroup') GROUP BY c.selected_ad_account_id,i.external_campaign_id,i.date_start),
 cdr AS MATERIALIZED (SELECT *,CASE WHEN coalesce(spend,0)=0 THEN 0 ELSE public.fx_convert(spend,currency,v_ref,d) END gr FROM cd), tagged AS (SELECT cdr.*, CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(v_report->'plataformas') p,jsonb_array_elements(p->'campanhas') c WHERE p->>'platform'=cdr.platform AND c->>'campaign_id'=cdr.cid AND c->>'account_id'=cdr.account AND c->'resultado'->>'nome'='chegada_smart_link') THEN gr ELSE 0 END gt FROM cdr)
 SELECT coalesce(jsonb_agg(jsonb_build_object('dia',d,'plataforma',platform,'conta',account,'moeda',currency,'gasto',g,'gasto_ref',gr,'gasto_trafego_ref',gt) ORDER BY d,platform,account) FILTER(WHERE d BETWEEN v_from AND v_to),'[]'),
  CASE WHEN count(*) FILTER(WHERE d BETWEEN date_trunc('month',current_date)::date AND current_date AND miss)>0 THEN NULL ELSE coalesce(round(sum(gr) FILTER(WHERE d BETWEEN date_trunc('month',current_date)::date AND current_date),2),0) END
 INTO v_daily,v_month FROM (SELECT d,platform,account,currency,sum(spend) g,sum(gr) gr,sum(gt) gt,bool_or(spend>0 AND gr IS NULL) miss FROM tagged GROUP BY 1,2,3,4) x;
 SELECT coalesce(jsonb_agg(jsonb_build_object('moeda',currency,'moeda_ref',v_ref,'fonte','BCE','taxa',public.fx_convert(1,currency,v_ref,d),'data',d) ORDER BY d,currency),'[]') INTO v_fx
 FROM (SELECT DISTINCT j->>'moeda' currency,(j->>'dia')::date d FROM jsonb_array_elements(v_daily) j WHERE j->>'moeda'<>v_ref) f;
 SELECT coalesce(jsonb_agg(jsonb_build_object('plataforma',c->>'platform','campanha',c->>'nome','objetivo',c->>'objective',
  'segmentacao',jsonb_build_object('pais',c->>'country','regioes',(SELECT jsonb_agg(p->'geo') FROM jsonb_array_elements(c->'parts') p WHERE p->'geo' IS NOT NULL)),
  'orcamento_dia',(c->>'daily_budget')::numeric,'moeda',c->>'currency','termina',c->'end_date','estado',c->>'status',
  'dias_projecao',greatest(0,least(coalesce((c->>'end_date')::date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date),(date_trunc('month',current_date)+interval '1 month - 1 day')::date)-current_date))), '[]') INTO v_active
 FROM jsonb_array_elements(v_campaigns) c WHERE upper(c->>'status') IN ('ACTIVE','ENABLED','ENABLE','CAMPAIGN_STATUS_ENABLE')
 AND coalesce((c->>'start_date')::date,current_date)<=current_date AND coalesce((c->>'end_date')::date,current_date)>=current_date;
 SELECT coalesce(jsonb_agg(jsonb_build_object('plataforma',platform,'em_vigor_ref',amount,'orcamento_em_falta',missing)),'[]'),
 CASE WHEN bool_or(missing) THEN NULL ELSE coalesce(sum(amount),0) END INTO v_projection,v_projected
 FROM (SELECT c->>'plataforma' platform,CASE WHEN bool_or(c->>'orcamento_dia' IS NULL OR public.fx_convert((c->>'orcamento_dia')::numeric,c->>'moeda',v_ref,current_date) IS NULL) THEN NULL
 ELSE sum(public.fx_convert((c->>'orcamento_dia')::numeric,c->>'moeda',v_ref,current_date)*(c->>'dias_projecao')::integer) END amount,
 bool_or(c->>'orcamento_dia' IS NULL OR public.fx_convert((c->>'orcamento_dia')::numeric,c->>'moeda',v_ref,current_date) IS NULL) missing FROM jsonb_array_elements(v_active) c GROUP BY 1) q;
 -- Seven series. Flow metrics are per day; social metrics are measured stocks, never invented zeroes.
 FOR spec IN SELECT * FROM (VALUES
 ('gasto_total','Gasto total',v_ref,'ads'),('chegadas_spotify','Chegadas ao Spotify','chegadas','song_link_events'),('custo_por_chegada','Custo por chegada',v_ref||'/chegada','D-ERP185'),
 ('ouvintes_mensais_spotify','Ouvintes mensais Spotify','ouvintes','artist_metrics_daily'),('streams_periodo','Streams das músicas no período','streams','artist_song_metrics_daily'),
 ('seguidores_tiktok','Seguidores TikTok','seguidores','artist_metrics_daily'),('seguidores_instagram','Seguidores Instagram','seguidores','artist_metrics_daily')) x(chave,rotulo,unit,source)
 LOOP
  v_base:=NULL;v_current:=NULL;pts:='[]';
  IF spec.chave IN ('ouvintes_mensais_spotify','seguidores_tiktok','seguidores_instagram') THEN
   WITH m AS (SELECT DISTINCT ON(metric_date) metric_date d,value v,source FROM public.artist_metrics_daily WHERE artist_id=p_artist_id AND platform=CASE spec.chave WHEN 'ouvintes_mensais_spotify' THEN 'spotify' WHEN 'seguidores_tiktok' THEN 'tiktok' ELSE 'instagram' END AND metric=CASE WHEN spec.chave='ouvintes_mensais_spotify' THEN 'monthly_listeners' ELSE 'followers' END AND metric_date<=v_to ORDER BY metric_date,CASE source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END,captured_at DESC NULLS LAST)
   SELECT coalesce(jsonb_agg(jsonb_build_object('d',d,'v',v) ORDER BY d) FILTER(WHERE d BETWEEN v_from AND v_to),'[]') INTO pts FROM m;
   SELECT (p->>'d')::date d,(p->>'v')::numeric v INTO v_base FROM jsonb_array_elements(pts) p ORDER BY abs((p->>'d')::date-v_from) LIMIT 1;
   SELECT (p->>'d')::date d,(p->>'v')::numeric v INTO v_current FROM jsonb_array_elements(pts) p ORDER BY p->>'d' DESC LIMIT 1;
  ELSIF spec.chave='streams_periodo' THEN
   WITH m AS (SELECT DISTINCT ON(song_id,metric_date) song_id,metric_date d,value v FROM public.artist_song_metrics_daily WHERE artist_id=p_artist_id AND metric='s4a_streams_day' AND metric_date BETWEEN v_from AND v_to ORDER BY song_id,metric_date,(source='s4a_api') DESC,captured_at DESC)
   SELECT coalesce(jsonb_agg(jsonb_build_object('d',d,'v',v) ORDER BY d),'[]'),sum(v) INTO pts,v_streams FROM (SELECT d,sum(v) v FROM m GROUP BY d) x;
   SELECT v_from d,0::numeric v INTO v_base; SELECT max((p->>'d')::date) d,v_streams v INTO v_current FROM jsonb_array_elements(pts) p;
  ELSE
   IF spec.chave='gasto_total' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('d',d,'v',v) ORDER BY d),'[]') INTO pts FROM (SELECT j->>'dia' d,sum((j->>'gasto_ref')::numeric) v FROM jsonb_array_elements(v_daily) j GROUP BY 1) z;
    SELECT v_from d,0::numeric v INTO v_base;SELECT v_to d,v_spend v INTO v_current;
   ELSE
    -- Same effective-channel mapping as D-ERP185; test events excluded. No click fallback.
    WITH ev AS (SELECT e.created_at::date d,public.song_link_event_canal(l.canal,e.utm_source,e.utm_medium,e.utm_campaign) canal FROM public.song_link_events e LEFT JOIN public.song_links l ON l.id=e.link_id WHERE e.artist_id=p_artist_id AND e.event='arrival' AND e.created_at>=v_from::timestamptz AND e.created_at<(v_to+1)::timestamptz),
    arr AS (SELECT d,count(*) n FROM ev WHERE canal IN ('meta_ads','google_ads','tiktok_ads') GROUP BY d),
    tr AS (SELECT (j->>'dia')::date d,sum((j->>'gasto_trafego_ref')::numeric) spend FROM jsonb_array_elements(v_daily) j GROUP BY 1)
    SELECT coalesce(jsonb_agg(jsonb_build_object('d',d,'v',CASE WHEN spec.chave='chegadas_spotify' THEN n ELSE CASE WHEN n>0 THEN round(spend/n,4) END END) ORDER BY d),'[]') INTO pts FROM arr LEFT JOIN tr USING(d);
    SELECT v_from d,CASE WHEN spec.chave='chegadas_spotify' THEN 0::numeric ELSE NULL::numeric END v INTO v_base;
    SELECT v_to d,CASE WHEN spec.chave='chegadas_spotify' THEN v_arrivals ELSE CASE WHEN v_arrivals>0 THEN round(v_traffic/v_arrivals,4) END END v INTO v_current;
   END IF;
  END IF;
  v_kpis:=v_kpis||jsonb_build_object('chave',spec.chave,'valor_inicial',v_base.v,'valor_atual',v_current.v,'delta',v_current.v-v_base.v,'unidade',spec.unit,'fonte',spec.source,'as_of',v_current.d,'base_data',v_base.d);
  v_series:=v_series||jsonb_build_object('chave',spec.chave,'rotulo',spec.rotulo,'pontos',pts,'fonte',spec.source,'as_of',v_current.d);
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('dia',d,'texto',txt) ORDER BY d,txt),'[]') INTO v_marks FROM (
 SELECT (c->>'start_date')::date d,'Início: '||(c->>'nome') txt FROM jsonb_array_elements(v_campaigns) c WHERE c->>'nome' ~* '^\s*\[mp\]' AND (c->>'start_date')::date BETWEEN v_from AND v_to
 UNION ALL SELECT (c->>'end_date')::date,'Fim: '||(c->>'nome') FROM jsonb_array_elements(v_campaigns) c WHERE c->>'nome' ~* '^\s*\[mp\]' AND (c->>'end_date')::date BETWEEN v_from AND v_to
 UNION ALL SELECT (j->>'d')::date,'Investimento diário acima de 2× a média do período' FROM jsonb_array_elements(v_series->0->'pontos') j WHERE (j->>'v')::numeric>2*v_spend/(v_to-v_from+1)) z;
 RETURN jsonb_build_object('artista_id',p_artist_id,'ref_currency',v_ref,'periodo',jsonb_build_object('de',v_from,'ate',v_to,'inicio_gestao',v_start,'dia_parcial',v_to>=current_date),
 'kpis',v_kpis,'gasto_diario',v_daily,'cambio',v_fx,'totais_plataforma',coalesce(v_totals,'[]'),'marcos',v_marks,'series',v_series,'campanhas_no_ar',v_active,
 'ritmo_diario_ref',v_spend/(v_to-v_from+1),'projecao',v_projection,'total_projetado_ref',v_projected,'total_mes_ref',v_month+v_projected,
 'fontes',jsonb_build_array('artist_ads_period_report: campanhas.gasto_ref, gasto_trafego e chegadas por canal (D-ERP185)','Insights diários: Meta, Google e TikTok; precedência campaign > adgroup','artist_metrics_daily: aggregator > platform_api > public_page','artist_song_metrics_daily: s4a_streams_day, soma diária por música','fx_convert: BCE do próprio dia; câmbio ausente = null; projeção exclui hoje','Orçamentos diários activos; lifetime não é orçamento diário'),
 'lacunas',jsonb_build_array('Chegadas ao Spotify são chegadas a smart links do artista nos canais pagos; não provam abertura nem stream no Spotify.','Streams: soma S4A diária das músicas do artista; sem medição retorna null.'));
END $fn$;
REVOKE ALL ON FUNCTION public.artist_ads_investment_report(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_investment_report(uuid,date,date) TO authenticated,service_role;
