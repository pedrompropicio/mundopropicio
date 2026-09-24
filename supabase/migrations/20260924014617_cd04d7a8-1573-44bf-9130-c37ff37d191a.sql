CREATE OR REPLACE FUNCTION public.song_growth_summary(p_song_id uuid, p_to date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  s record;
  v_artist_name text;
  v_notas jsonb := '[]'::jsonb;
  v_tec jsonb := '[]'::jsonb;
  v_rep_s text; v_rep_o text;
  g_musica jsonb := '[]'::jsonb;
  g_ugc jsonb := '[]'::jsonb;
  g_redes jsonb := '[]'::jsonb;
  b record; a record;
  spec record;
  v_line jsonb;
  v_pct numeric;
  v_last date; v_c0 numeric; v_c7 numeric; v_c14 numeric;
  v_sem_atual numeric; v_sem_ant numeric;
  v_streams_val numeric; v_streams_date date;
  v_ol jsonb; v_ugc jsonb;
  v_s4a_metric text;
BEGIN
  SELECT * INTO s FROM public.artist_songs WHERE id = p_song_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'música inexistente' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.artist_ads_assert_access(s.artist_id);
  SELECT name INTO v_artist_name FROM public.artists WHERE id = s.artist_id;

  IF s.release_date IS NULL THEN
    v_notas := v_notas || to_jsonb('Música sem data de lançamento: os valores iniciais são a primeira leitura disponível.'::text);
    v_tec := v_tec || to_jsonb('release_date NULL: todas as bases são primeira_medicao.'::text);
  END IF;

  FOR spec IN
    SELECT * FROM (VALUES
      ('musica','Spotify','streams','spotify','streams','aggregator','song'),
      ('video_ugc','TikTok','ugc_creators','tiktok','ugc_creators','tiktok_artists','song'),
      ('video_ugc','TikTok','ugc_views','tiktok','ugc_views','tiktok_artists','song'),
      ('redes','Instagram','seguidores','instagram','followers','aggregator','artist'),
      ('redes','TikTok','seguidores','tiktok','followers','aggregator','artist'),
      ('redes','Spotify','ouvintes_mensais','spotify','monthly_listeners','aggregator','artist'),
      ('redes','YouTube','inscritos','youtube','subscribers','aggregator','artist')
    ) t(grupo, canal, indicador, platform, metric, source, escopo)
  LOOP
    b := NULL; a := NULL;
    IF spec.escopo = 'song' THEN
      SELECT metric_date d, value v, 'lancamento' tipo INTO b FROM public.artist_song_metrics_daily
        WHERE song_id = p_song_id AND platform = spec.platform AND metric = spec.metric AND source = spec.source
          AND s.release_date IS NOT NULL AND metric_date <= s.release_date AND metric_date <= p_to
        ORDER BY metric_date DESC LIMIT 1;
      IF b.d IS NULL THEN
        SELECT metric_date d, value v, 'primeira_medicao' tipo INTO b FROM public.artist_song_metrics_daily
          WHERE song_id = p_song_id AND platform = spec.platform AND metric = spec.metric AND source = spec.source
            AND metric_date <= p_to
          ORDER BY metric_date ASC LIMIT 1;
      END IF;
      SELECT metric_date d, value v INTO a FROM public.artist_song_metrics_daily
        WHERE song_id = p_song_id AND platform = spec.platform AND metric = spec.metric AND source = spec.source
          AND metric_date <= p_to
        ORDER BY metric_date DESC LIMIT 1;
    ELSE
      SELECT metric_date d, value v, 'lancamento' tipo INTO b FROM public.artist_metrics_daily
        WHERE artist_id = s.artist_id AND platform = spec.platform AND metric = spec.metric AND source = spec.source
          AND s.release_date IS NOT NULL AND metric_date <= s.release_date AND metric_date <= p_to
        ORDER BY metric_date DESC LIMIT 1;
      IF b.d IS NULL THEN
        SELECT metric_date d, value v, 'primeira_medicao' tipo INTO b FROM public.artist_metrics_daily
          WHERE artist_id = s.artist_id AND platform = spec.platform AND metric = spec.metric AND source = spec.source
            AND metric_date <= p_to
          ORDER BY metric_date ASC LIMIT 1;
      END IF;
      SELECT metric_date d, value v INTO a FROM public.artist_metrics_daily
        WHERE artist_id = s.artist_id AND platform = spec.platform AND metric = spec.metric AND source = spec.source
          AND metric_date <= p_to
        ORDER BY metric_date DESC LIMIT 1;
    END IF;

    IF b.d IS NULL OR a.d IS NULL OR a.d = b.d THEN
      v_tec := v_tec || to_jsonb(format('%s %s: sem 2 medições em datas diferentes — linha omitida.', spec.canal, spec.indicador));
      CONTINUE;
    END IF;
    v_pct := CASE WHEN b.v = 0 THEN NULL ELSE (a.v - b.v) / b.v * 100 END;
    v_pct := CASE WHEN v_pct IS NULL THEN NULL WHEN abs(v_pct) < 0.1 THEN round(v_pct, 2) ELSE round(v_pct, 1) END;
    v_line := jsonb_build_object('canal', spec.canal, 'indicador', spec.indicador,
      'base', b.v, 'base_data', b.d, 'base_tipo', b.tipo, 'atual', a.v, 'atual_data', a.d,
      'variacao_pct', v_pct, 'source', spec.source, 'base_source', spec.source,
      'precisao', CASE WHEN spec.source = 'tiktok_artists' THEN 'painel_acumulado' ELSE 'serie' END);
    IF spec.grupo = 'musica' THEN g_musica := g_musica || v_line;
    ELSIF spec.grupo = 'video_ugc' THEN g_ugc := g_ugc || v_line;
    ELSE g_redes := g_redes || v_line; END IF;
    IF spec.metric = 'streams' THEN
      v_streams_val := a.v; v_streams_date := a.d;
      IF b.tipo = 'primeira_medicao' THEN
        v_notas := v_notas || to_jsonb(format('Streams medidos desde %s (primeira leitura disponível).', to_char(b.d,'DD/MM')));
      END IF;
    END IF;
    IF spec.metric = 'monthly_listeners' THEN
      v_ol := jsonb_build_object('chave','ouvintes_mensais','base',b.v,'atual',a.v,'variacao_pct',v_pct);
    END IF;
  END LOOP;

  FOR v_s4a_metric IN
    SELECT DISTINCT metric FROM public.artist_song_metrics_daily
    WHERE song_id = p_song_id AND metric LIKE 's4a\_%' AND metric_date <= p_to ORDER BY 1
  LOOP
    SELECT metric_date d, value v, source src INTO b FROM public.artist_song_metrics_daily
      WHERE song_id = p_song_id AND metric = v_s4a_metric AND metric_date <= p_to ORDER BY metric_date ASC LIMIT 1;
    SELECT metric_date d, value v, source src INTO a FROM public.artist_song_metrics_daily
      WHERE song_id = p_song_id AND metric = v_s4a_metric AND metric_date <= p_to ORDER BY metric_date DESC LIMIT 1;
    IF a.d = b.d THEN
      v_tec := v_tec || to_jsonb(format('S4A %s: só há registo em %s — linha omitida.', v_s4a_metric, b.d));
      CONTINUE;
    END IF;
    v_pct := CASE WHEN b.v = 0 THEN NULL ELSE (a.v - b.v) / b.v * 100 END;
    v_pct := CASE WHEN v_pct IS NULL THEN NULL WHEN abs(v_pct) < 0.1 THEN round(v_pct, 2) ELSE round(v_pct, 1) END;
    g_musica := g_musica || jsonb_build_object('canal','Spotify for Artists','indicador',v_s4a_metric,
      'base',b.v,'base_data',b.d,'base_tipo','primeira_medicao','atual',a.v,'atual_data',a.d,
      'variacao_pct',v_pct,'source',a.src,'base_source',b.src,'precisao','serie');
  END LOOP;

  WITH pts AS (
    SELECT DISTINCT ON (metric_date) metric_date d, value v, source src, source_ref ref
    FROM public.artist_song_metrics_daily
    WHERE song_id = p_song_id AND platform = 'tiktok' AND metric = 'ugc_videos'
      AND source IN ('ios_shortcut','manual') AND metric_date <= p_to
    ORDER BY metric_date, CASE source WHEN 'ios_shortcut' THEN 0 ELSE 1 END
  )
  SELECT
    (SELECT to_jsonb(x) FROM (SELECT * FROM pts WHERE s.release_date IS NOT NULL AND d <= s.release_date ORDER BY d DESC LIMIT 1) x) AS bl,
    (SELECT to_jsonb(x) FROM (SELECT * FROM pts ORDER BY d ASC LIMIT 1) x) AS bf,
    (SELECT to_jsonb(x) FROM (SELECT * FROM pts ORDER BY d DESC LIMIT 1) x) AS at
  INTO b;
  DECLARE vb jsonb; vt text; va jsonb; bv numeric; av numeric;
  BEGIN
    vb := coalesce(b.bl, b.bf); vt := CASE WHEN b.bl IS NOT NULL THEN 'lancamento' ELSE 'primeira_medicao' END;
    va := b.at;
    IF vb IS NULL OR va IS NULL OR (vb->>'d') = (va->>'d') THEN
      v_tec := v_tec || to_jsonb('TikTok ugc_videos: sem 2 medições em datas diferentes — linha omitida.'::text);
    ELSE
      bv := (vb->>'v')::numeric; av := (va->>'v')::numeric;
      v_pct := CASE WHEN bv = 0 THEN NULL ELSE (av - bv) / bv * 100 END;
      v_pct := CASE WHEN v_pct IS NULL THEN NULL WHEN abs(v_pct) < 0.1 THEN round(v_pct, 2) ELSE round(v_pct, 1) END;
      g_ugc := jsonb_build_object('canal','TikTok','indicador','ugc_videos',
        'base',bv,'base_data',(vb->>'d')::date,'base_tipo',vt,'atual',av,'atual_data',(va->>'d')::date,
        'variacao_pct',v_pct,'source',va->>'src','base_source',vb->>'src',
        'precisao', CASE WHEN va->>'src' = 'ios_shortcut' THEN 'arredondado_app' ELSE 'leitura_manual' END) || g_ugc;
      v_ugc := jsonb_build_object('chave','ugc_videos','base',bv,'atual',av,'variacao_pct',v_pct);
      IF va->>'src' = 'ios_shortcut' THEN
        v_notas := v_notas || to_jsonb('Publicações no TikTok: contagem aproximada do app.'::text);
      END IF;
      IF (vb->>'src') <> (va->>'src') THEN
        v_tec := v_tec || to_jsonb(format('ugc_videos: base %s (%s) e atual %s (%s) — excepção de precedência ios_shortcut > manual.',
          vb->>'d', vb->>'src', va->>'d', va->>'src'));
      END IF;
    END IF;
  END;

  -- Semana de streams: dia com valor igual ao do dia anterior (aggregator) = sem leitura Soundcharts.
  SELECT string_agg(to_char(d,'YYYY-MM-DD'), ', ' ORDER BY d) INTO v_rep_s FROM (
    SELECT metric_date d, value v, lag(value) OVER (ORDER BY metric_date) pv, lag(metric_date) OVER (ORDER BY metric_date) pd
    FROM public.artist_song_metrics_daily
    WHERE song_id=p_song_id AND platform='spotify' AND metric='streams' AND source='aggregator' AND metric_date <= p_to) x
  WHERE pd = d - 1 AND pv = v;
  IF v_rep_s IS NOT NULL THEN
    v_tec := v_tec || to_jsonb(format('streams aggregator: dias repetidos (Soundcharts sem actualização) omitidos: %s.', v_rep_s));
  END IF;
  SELECT max(d) INTO v_last FROM (SELECT d, v FROM (SELECT metric_date d, value v, lag(value) OVER (ORDER BY metric_date) pv, lag(metric_date) OVER (ORDER BY metric_date) pd FROM public.artist_song_metrics_daily WHERE song_id=p_song_id AND platform='spotify' AND metric='streams' AND source='aggregator' AND metric_date <= p_to) x0 WHERE NOT (pd IS NOT NULL AND pd = d - 1 AND pv = v)) ss;
  IF v_last IS NOT NULL THEN
    SELECT v INTO v_c0 FROM (SELECT d, v FROM (SELECT metric_date d, value v, lag(value) OVER (ORDER BY metric_date) pv, lag(metric_date) OVER (ORDER BY metric_date) pd FROM public.artist_song_metrics_daily WHERE song_id=p_song_id AND platform='spotify' AND metric='streams' AND source='aggregator' AND metric_date <= p_to) x0 WHERE NOT (pd IS NOT NULL AND pd = d - 1 AND pv = v)) ss WHERE d = v_last;
    SELECT v INTO v_c7 FROM (SELECT d, v FROM (SELECT metric_date d, value v, lag(value) OVER (ORDER BY metric_date) pv, lag(metric_date) OVER (ORDER BY metric_date) pd FROM public.artist_song_metrics_daily WHERE song_id=p_song_id AND platform='spotify' AND metric='streams' AND source='aggregator' AND metric_date <= p_to) x0 WHERE NOT (pd IS NOT NULL AND pd = d - 1 AND pv = v)) ss WHERE d = v_last-7;
    SELECT v INTO v_c14 FROM (SELECT d, v FROM (SELECT metric_date d, value v, lag(value) OVER (ORDER BY metric_date) pv, lag(metric_date) OVER (ORDER BY metric_date) pd FROM public.artist_song_metrics_daily WHERE song_id=p_song_id AND platform='spotify' AND metric='streams' AND source='aggregator' AND metric_date <= p_to) x0 WHERE NOT (pd IS NOT NULL AND pd = d - 1 AND pv = v)) ss WHERE d = v_last-14;
    v_sem_atual := CASE WHEN v_c7 IS NOT NULL THEN v_c0 - v_c7 END;
    v_sem_ant := CASE WHEN v_c7 IS NOT NULL AND v_c14 IS NOT NULL THEN v_c7 - v_c14 END;
    IF v_c7 IS NULL THEN
      v_notas := v_notas || to_jsonb(format('Streams da semana não calculados: sem leitura em %s.', to_char(v_last-7,'DD/MM')));
      v_tec := v_tec || to_jsonb(format('streams_semana: ponto %s ausente ou repetido — semana atual null.', v_last-7));
    END IF;
    IF v_c14 IS NULL THEN
      v_notas := v_notas || to_jsonb(format('Streams da semana anterior não calculados: sem leitura em %s.', to_char(v_last-14,'DD/MM')));
      v_tec := v_tec || to_jsonb(format('streams_semana: ponto %s ausente ou repetido — semana anterior null.', v_last-14));
    END IF;
  END IF;
  SELECT string_agg(to_char(d,'YYYY-MM-DD'), ', ' ORDER BY d) INTO v_rep_o FROM (
    SELECT metric_date d, value v, lag(value) OVER (ORDER BY metric_date) pv, lag(metric_date) OVER (ORDER BY metric_date) pd
    FROM public.artist_metrics_daily
    WHERE artist_id=s.artist_id AND platform='spotify' AND metric='monthly_listeners' AND source='aggregator' AND metric_date <= p_to) x
  WHERE pd = d - 1 AND pv = v AND (s.release_date IS NULL OR d >= s.release_date - 7);
  IF v_rep_o IS NOT NULL THEN
    v_tec := v_tec || to_jsonb(format('monthly_listeners aggregator: dias repetidos omitidos da série: %s.', v_rep_o));
  END IF;
  v_pct := CASE WHEN v_sem_ant IS NULL OR v_sem_ant = 0 OR v_sem_atual IS NULL THEN NULL ELSE (v_sem_atual - v_sem_ant) / v_sem_ant * 100 END;
  v_pct := CASE WHEN v_pct IS NULL THEN NULL WHEN abs(v_pct) < 0.1 THEN round(v_pct, 2) ELSE round(v_pct, 1) END;

  RETURN jsonb_build_object(
    'musica', jsonb_build_object('song_id', s.id, 'titulo', s.title,
      'artistas', to_jsonb(ARRAY[v_artist_name] || coalesce(s.featuring, ARRAY[]::text[])),
      'lancamento', s.release_date, 'dias', CASE WHEN s.release_date IS NULL THEN NULL ELSE p_to - s.release_date END),
    'kpis', jsonb_build_array(
      jsonb_build_object('chave','streams_spotify','valor',v_streams_val,'data',v_streams_date),
      jsonb_build_object('chave','streams_semana','valor',v_sem_atual,'anterior',v_sem_ant,'variacao_pct',v_pct),
      coalesce(v_ol, jsonb_build_object('chave','ouvintes_mensais','base',null,'atual',null,'variacao_pct',null)),
      coalesce(v_ugc, jsonb_build_object('chave','ugc_videos','base',null,'atual',null,'variacao_pct',null))),
    'grupos', jsonb_build_array(
      jsonb_build_object('grupo','musica','linhas',g_musica),
      jsonb_build_object('grupo','video_ugc','linhas',g_ugc),
      jsonb_build_object('grupo','redes','linhas',g_redes)),
    'series', jsonb_build_object(
      'streams_acumulados', coalesce((SELECT jsonb_agg(jsonb_build_object('d',d,'v',v) ORDER BY d) FROM (SELECT d, v FROM (SELECT metric_date d, value v, lag(value) OVER (ORDER BY metric_date) pv, lag(metric_date) OVER (ORDER BY metric_date) pd FROM public.artist_song_metrics_daily WHERE song_id=p_song_id AND platform='spotify' AND metric='streams' AND source='aggregator' AND metric_date <= p_to) x0 WHERE NOT (pd IS NOT NULL AND pd = d - 1 AND pv = v)) ss), '[]'::jsonb),
      'ouvintes_mensais', coalesce((SELECT jsonb_agg(jsonb_build_object('d',d,'v',v) ORDER BY d) FROM (
          SELECT metric_date d, value v, lag(value) OVER (ORDER BY metric_date) pv, lag(metric_date) OVER (ORDER BY metric_date) pd
          FROM public.artist_metrics_daily WHERE artist_id=s.artist_id AND platform='spotify' AND metric='monthly_listeners' AND source='aggregator'
            AND metric_date <= p_to) x
          WHERE NOT (pd IS NOT NULL AND pd = d - 1 AND pv = v) AND (s.release_date IS NULL OR d >= s.release_date - 7)), '[]'::jsonb)),
    'notas', v_notas,
    'notas_tecnicas', v_tec,
    'gerado_em', now());
END $$;

REVOKE EXECUTE ON FUNCTION public.song_growth_summary(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.song_growth_summary(uuid, date) TO authenticated, service_role;