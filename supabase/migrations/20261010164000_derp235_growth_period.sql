-- D-ERP235: fonctions uniquement; aucune table ni donnée modifiée.
DO $check$ DECLARE old_result jsonb; new_result jsonb; d text; BEGIN
d:=pg_get_functiondef('public.song_growth_summary(uuid,date)'::regprocedure);
EXECUTE replace(d,'public.song_growth_summary(', 'public._song_growth_summary_initial(');
old_result:=public.song_growth_summary('74c40d7b-357b-4311-acbe-eb9bfa7ba7c7',CURRENT_DATE);
DROP FUNCTION public.song_growth_summary(uuid,date);
EXECUTE $create$CREATE OR REPLACE FUNCTION public.song_growth_summary(p_song_id uuid, p_to date DEFAULT CURRENT_DATE, p_from date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $fn$
DECLARE
 s record; spec record; b record; a record; v jsonb; ln jsonb; groups_out jsonb := '[]'; lines jsonb;
 kpis jsonb := '[]'; kp jsonb; series_out jsonb := '{}'; ent record;
 pct numeric; prec numeric; tol integer; days integer; lo integer; hi integer;
BEGIN
 SELECT * INTO s FROM public.artist_songs WHERE id=p_song_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'música inexistente' USING ERRCODE='P0002'; END IF;
 PERFORM public.artist_ads_assert_access(s.artist_id);
 IF p_from IS NULL THEN RETURN public._song_growth_summary_initial(p_song_id,p_to); END IF;
 IF p_to IS NULL OR p_to<p_from THEN RAISE EXCEPTION 'período inválido' USING ERRCODE='22023'; END IF;
 v := public._song_growth_summary_initial(p_song_id,p_to);
 -- D-ERP186: ponto mais próximo; janela de tolerância ±5 dias (7: 2–12; 30: 25–35).
 tol:=5;
 FOR spec IN
 SELECT * FROM (VALUES
 ('musica','Spotify','streams','spotify','streams','song'),
 ('video_ugc','TikTok','ugc_creators','tiktok','ugc_creators','song'),
 ('video_ugc','TikTok','ugc_views','tiktok','ugc_views','song'),
 ('video_ugc','TikTok for Artists','ugc_videos_painel','tiktok','ugc_videos','panel'),
 ('video_ugc','TikTok','ugc_videos','tiktok','ugc_videos','app'),
 ('redes','Instagram','seguidores','instagram','followers','artist'),
 ('redes','TikTok','seguidores','tiktok','followers','artist'),
 ('redes','Spotify','ouvintes_mensais','spotify','monthly_listeners','artist'),
 ('redes','YouTube','inscritos','youtube','subscribers','artist')) x(grupo,canal,indicador,platform,metric,scope)
 UNION ALL SELECT 'musica','Spotify for Artists',metric,platform,metric,'s4a' FROM public.artist_song_metrics_daily
 WHERE song_id=p_song_id AND metric LIKE 's4a\_%' AND metric NOT LIKE '%\_day' AND metric_date<=p_to GROUP BY metric,platform
 LOOP
  b:=NULL; a:=NULL; prec:=NULL;
  IF spec.scope='artist' THEN
   SELECT metric_date d,value v,source src,source_ref ref INTO a FROM public.artist_metrics_daily
    WHERE artist_id=s.artist_id AND platform=spec.platform AND metric=spec.metric AND metric_date<=p_to
    ORDER BY metric_date DESC,CASE source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END,captured_at DESC NULLS LAST LIMIT 1;
   days:=a.d-p_from; lo:=days-tol; hi:=days+tol;
   SELECT metric_date d,value v,source src,source_ref ref INTO b FROM public.artist_metrics_daily
    WHERE artist_id=s.artist_id AND platform=spec.platform AND metric=spec.metric
     AND metric_date BETWEEN p_from-tol AND least(p_to,p_from+tol)
    ORDER BY abs(metric_date-p_from),CASE source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END,captured_at DESC NULLS LAST LIMIT 1;
   -- The helper's window is capped at p_to too, matching the base selection above.
   lo:=greatest(lo,a.d-p_to);
   pct:=public._artist_metric_pct_near(s.artist_id,spec.platform,spec.metric,a.d,a.v,days,lo,hi);
   prec:=public._artist_metric_precisao(s.artist_id,spec.platform,spec.metric,a.d,a.v,a.ref);
  ELSE
   SELECT metric_date d,value v,source src,source_ref ref INTO a FROM public.artist_song_metrics_daily
    WHERE song_id=p_song_id AND platform=spec.platform AND metric=spec.metric AND metric_date<=p_to
     AND CASE spec.scope WHEN 'app' THEN source IN ('ios_shortcut','manual') WHEN 'panel' THEN source='tiktok_artists' WHEN 's4a' THEN true ELSE source=CASE WHEN spec.platform='spotify' THEN 'aggregator' ELSE 'tiktok_artists' END END
    ORDER BY metric_date DESC,CASE source WHEN 'ios_shortcut' THEN 0 WHEN 'aggregator' THEN 1 WHEN 's4a_api' THEN 1 WHEN 'manual' THEN 2 ELSE 3 END,captured_at DESC NULLS LAST LIMIT 1;
   SELECT metric_date d,value v,source src,source_ref ref INTO b FROM public.artist_song_metrics_daily
    WHERE song_id=p_song_id AND platform=spec.platform AND metric=spec.metric
     AND metric_date BETWEEN p_from-tol AND least(p_to,p_from+tol)
     AND CASE spec.scope WHEN 'app' THEN source IN ('ios_shortcut','manual') WHEN 'panel' THEN source='tiktok_artists' WHEN 's4a' THEN true ELSE source=CASE WHEN spec.platform='spotify' THEN 'aggregator' ELSE 'tiktok_artists' END END
    ORDER BY abs(metric_date-p_from),CASE source WHEN 'ios_shortcut' THEN 0 WHEN 'aggregator' THEN 1 WHEN 's4a_api' THEN 1 WHEN 'manual' THEN 2 ELSE 3 END,captured_at DESC NULLS LAST LIMIT 1;
   pct:=CASE WHEN b.v<>0 THEN round((a.v-b.v)/b.v*100,2) END;
  END IF;
  ln:=jsonb_build_object('canal',spec.canal,'indicador',spec.indicador,'base',b.v,'base_data',b.d,'base_tipo','inicio_periodo',
   'atual',a.v,'atual_data',a.d,'delta',a.v-b.v,'variacao_pct',pct,'source',a.src,'base_source',b.src,
   'precisao',CASE WHEN spec.scope='app' THEN 'arredondado_app' WHEN spec.scope='panel' THEN 'painel_acumulado' ELSE 'serie' END,
   'precisao_valor',prec,'base_ausente',b.d IS NULL);
  IF a.d IS NOT NULL THEN
   groups_out:=groups_out||jsonb_build_object('grupo',spec.grupo,'linha',ln);
  END IF;
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('grupo',g,'linhas',coalesce((SELECT jsonb_agg(x->'linha') FROM jsonb_array_elements(groups_out) x WHERE x->>'grupo'=g),'[]'::jsonb))) INTO groups_out FROM unnest(ARRAY['musica','video_ugc','redes']) g;
 FOR kp IN SELECT * FROM jsonb_array_elements(v->'kpis') LOOP
  SELECT l INTO ln FROM jsonb_array_elements(groups_out) g,jsonb_array_elements(g->'linhas') l
   WHERE CASE kp->>'chave' WHEN 'streams_spotify' THEN l->>'indicador'='streams' WHEN 'streams_semana' THEN l->>'indicador'='streams' ELSE l->>'indicador'=kp->>'chave' END LIMIT 1;
  IF kp->>'chave'='streams_semana' THEN
   -- A comparison-period KPI must not carry a second, unrelated weekly base.
   kp:=jsonb_build_object('chave','streams_semana','valor',(ln->>'delta')::numeric,'anterior',NULL,'variacao_pct',ln->'variacao_pct',
    'fonte','aggregator_diferenca_periodo','periodo_de',p_from,'periodo_ate',p_to);
  END IF;
  kp:=kp||jsonb_build_object('base',ln->'base','base_data',ln->'base_data','base_tipo','inicio_periodo','atual',ln->'atual','delta',ln->'delta','variacao_pct',ln->'variacao_pct');
  kpis:=kpis||kp;
 END LOOP;
 FOR ent IN SELECT * FROM jsonb_each(v->'series') LOOP
  SELECT coalesce(jsonb_agg(p ORDER BY p->>'d'),'[]') INTO lines FROM jsonb_array_elements(ent.value) p WHERE (p->>'d')::date BETWEEN p_from AND p_to;
  series_out:=series_out||jsonb_build_object(ent.key,lines);
 END LOOP;
 RETURN v||jsonb_build_object('periodo',jsonb_build_object('de',p_from,'ate',p_to),'grupos',groups_out,'kpis',kpis,'series',series_out,
  'notas',jsonb_build_array('Comparação com o ponto mais próximo do início do período; a data real da base consta em cada linha.','Publicações TikTok do app e do painel são métodos distintos; não se somam nem se comparam entre si.'),
  'notas_tecnicas',jsonb_build_array('Base inicio_periodo: ponto mais próximo a ±5 dias, nunca posterior a p_to; sem ponto na janela a base e o delta são null.','Precisão das métricas de artista pelo helper D-ERP186. Streams no período: diferença do acumulado, não soma de acumulados.'));
END $fn$;
$create$;
new_result:=public.song_growth_summary('74c40d7b-357b-4311-acbe-eb9bfa7ba7c7',CURRENT_DATE);
IF md5(old_result::text)<>md5(new_result::text) THEN RAISE EXCEPTION 'D-ERP235: MD5 incompatível'; END IF;
RAISE NOTICE 'D-ERP235 MD5 antes=% depois=%',md5(old_result::text),md5(new_result::text); END $check$;
REVOKE ALL ON FUNCTION public._song_growth_summary_initial(uuid,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.song_growth_summary(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.song_growth_summary(uuid,date,date) TO authenticated,service_role;
