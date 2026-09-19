-- A3: tiktok_ugc_por_dia pela idade NA DATA DO DADO (D-ERP59 adenda, 19/09/2026).
-- Mantém todas as colunas, nomes e ordem — CREATE OR REPLACE, sem DROP.
CREATE OR REPLACE VIEW public.v_song_benchmark_aligned AS
 WITH launch AS (
         SELECT s_1.id AS launch_song_id,
            s_1.company_id,
            s_1.artist_id AS launch_artist_id,
            s_1.release_date AS launch_release_date,
            GREATEST(CURRENT_DATE - s_1.release_date, 1) AS n
           FROM artist_songs s_1
          WHERE s_1.is_launch AND s_1.release_date IS NOT NULL AND COALESCE(s_1.tracking_status, ''::text) <> 'arquivado'::text
        ), pairs AS (
         SELECT l.launch_song_id,
            l.company_id,
            l.n,
            s2.id AS song_id,
            false AS is_self
           FROM launch l
             JOIN artist_comparables ac ON ac.artist_id = l.launch_artist_id
             JOIN artist_songs s2 ON s2.artist_id = ac.comparable_artist_id AND s2.is_reference AND s2.release_date IS NOT NULL AND COALESCE(s2.tracking_status, ''::text) <> 'arquivado'::text
        UNION ALL
         SELECT l.launch_song_id,
            l.company_id,
            l.n,
            l.launch_song_id,
            true
           FROM launch l
        )
 SELECT p.launch_song_id,
    p.company_id,
    p.n AS idade_alinhada_dias,
    p.song_id,
    p.is_self,
    a.id AS artist_id,
    a.name AS artist_name,
    s.title,
    s.release_date,
    CURRENT_DATE - s.release_date AS dias_desde_lancamento,
    s.notes AS song_notes,
    spn.value AS spotify_streams_dia_n,
    spn.metric_date AS spotify_streams_dia_n_date,
        CASE
            WHEN spn.value IS NOT NULL THEN round(spn.value / p.n::numeric, 2)
            ELSE NULL::numeric
        END AS spotify_streams_por_dia_n,
    sph.value AS spotify_streams_hoje,
    sph.metric_date AS spotify_streams_hoje_date,
    tt.value AS tiktok_ugc_latest,
    tt.metric_date AS tiktok_ugc_date,
    tt.source AS tiktok_ugc_source,
        CASE
            WHEN tt.value IS NOT NULL AND tt.metric_date IS NOT NULL
              THEN round(tt.value / GREATEST(tt.metric_date - s.release_date, 1)::numeric, 2)
            ELSE NULL::numeric
        END AS tiktok_ugc_por_dia,
    ig.value AS instagram_reels_latest,
    ig.metric_date AS instagram_reels_date
   FROM pairs p
     JOIN artist_songs s ON s.id = p.song_id
     JOIN artists a ON a.id = s.artist_id
     LEFT JOIN LATERAL ( SELECT m.value,
            m.metric_date
           FROM artist_song_metrics_daily m
          WHERE m.song_id = p.song_id AND m.platform = 'spotify'::text AND m.metric = 'streams'::text AND COALESCE(m.source, ''::text) <> 'manual'::text AND m.metric_date <= (s.release_date + (p.n - 1))
          ORDER BY m.metric_date DESC
         LIMIT 1) spn ON true
     LEFT JOIN LATERAL ( SELECT m.value,
            m.metric_date
           FROM artist_song_metrics_daily m
          WHERE m.song_id = p.song_id AND m.platform = 'spotify'::text AND m.metric = 'streams'::text AND COALESCE(m.source, ''::text) <> 'manual'::text
          ORDER BY m.metric_date DESC
         LIMIT 1) sph ON true
     LEFT JOIN LATERAL ( SELECT m.value,
            m.metric_date,
            m.source
           FROM artist_song_metrics_daily m
          WHERE m.song_id = p.song_id AND m.platform = 'tiktok'::text AND (m.metric = ANY (ARRAY['ugc_videos'::text, 'videos'::text]))
          ORDER BY m.metric_date DESC, (m.metric = 'ugc_videos'::text) DESC
         LIMIT 1) tt ON true
     LEFT JOIN LATERAL ( SELECT m.value,
            m.metric_date
           FROM artist_song_metrics_daily m
          WHERE m.song_id = p.song_id AND m.platform = 'instagram'::text AND m.metric = 'reels'::text
          ORDER BY m.metric_date DESC
         LIMIT 1) ig ON true;

-- C1: marca de relatório desactualizado + origem da geração.
ALTER TABLE public.artist_songs ADD COLUMN IF NOT EXISTS report_stale_at timestamptz NULL;
ALTER TABLE public.artist_song_reports ADD COLUMN IF NOT EXISTS trigger_source text NULL;
COMMENT ON COLUMN public.artist_songs.report_stale_at IS
  'Marca posta quando entram dados manuais novos que afectam o relatório desta música (D-ERP54 adenda 19/09/2026). O cron carreira-song-report-stale regenera e a própria função limpa a marca.';
COMMENT ON COLUMN public.artist_song_reports.trigger_source IS
  'Origem da geração: cron | manual | data_change.';

-- C2: helper de marcação. Própria música (se lançamento) + lançamentos cujo
-- benchmark inclui esta música de referência (mesma relação da vista).
CREATE OR REPLACE FUNCTION public.artist_song_mark_report_stale(p_song_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH src AS (
    SELECT id, artist_id, is_launch, COALESCE(is_reference, false) AS is_reference
    FROM public.artist_songs WHERE id = p_song_id
  ), alvos AS (
    SELECT src.id FROM src WHERE src.is_launch
    UNION
    SELECT l.id
    FROM src
      JOIN public.artist_comparables ac ON ac.comparable_artist_id = src.artist_id
      JOIN public.artist_songs l ON l.artist_id = ac.artist_id AND l.is_launch
    WHERE src.is_reference
  )
  UPDATE public.artist_songs s SET report_stale_at = now()
  WHERE s.id IN (SELECT id FROM alvos);
$function$;

REVOKE ALL ON FUNCTION public.artist_song_mark_report_stale(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_song_mark_report_stale(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_song_mark_report_stale(uuid) TO authenticated, service_role;

-- C2: métrica manual — marca só quando o valor é novo ou diferente.
CREATE OR REPLACE FUNCTION public.artist_song_metric_set_manual(p_song_id uuid, p_platform text, p_metric text, p_metric_date date, p_value numeric, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_song record;
  v_old numeric;
  v_existe boolean;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(), 'admin')
           OR public.has_role(auth.uid(), 'manager')
           OR public.has_role(auth.uid(), 'marketing_manager')
           OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'sem permissão para registar métricas manuais';
  END IF;
  IF p_platform NOT IN ('tiktok','instagram','youtube','spotify','deezer','apple-music','other') THEN
    RAISE EXCEPTION 'plataforma inválida: %', p_platform;
  END IF;
  IF p_value IS NULL OR p_value < 0 THEN RAISE EXCEPTION 'valor inválido'; END IF;
  SELECT id, artist_id, company_id INTO v_song FROM public.artist_songs WHERE id = p_song_id;
  IF v_song.id IS NULL THEN RAISE EXCEPTION 'música não encontrada'; END IF;

  SELECT value INTO v_old FROM public.artist_song_metrics_daily
   WHERE song_id = p_song_id AND platform = p_platform AND metric = p_metric
     AND metric_date = p_metric_date AND source = 'manual';
  v_existe := FOUND;

  INSERT INTO public.artist_song_metrics_daily (company_id, song_id, artist_id, platform, metric, metric_date, value, source, source_ref, captured_at)
  VALUES (v_song.company_id, p_song_id, v_song.artist_id, p_platform, p_metric, p_metric_date, p_value, 'manual',
          COALESCE(p_note, 'registo manual'), now())
  ON CONFLICT (song_id, platform, metric, metric_date, source)
  DO UPDATE SET value = EXCLUDED.value, source_ref = EXCLUDED.source_ref, captured_at = now();

  -- Relatório desactualizado só em valor NOVO ou DIFERENTE (D-ERP54 adenda).
  IF (NOT v_existe) OR v_old IS DISTINCT FROM p_value THEN
    PERFORM public.artist_song_mark_report_stale(p_song_id);
  END IF;

  INSERT INTO public.system_audit_log (company_id, entity_type, entity_id, action, changed_by, metadata)
  VALUES (v_song.company_id, 'artist_song', p_song_id::text, 'metric_manual', COALESCE(auth.uid()::text, 'service_role'),
          jsonb_build_object('platform', p_platform, 'metric', p_metric, 'date', p_metric_date, 'value', p_value, 'note', p_note));
END; $function$;

-- C2: streams por playlist — marca só quando alguma linha é nova ou diferente.
CREATE OR REPLACE FUNCTION public.artist_song_playlist_streams_set(p_song_id uuid, p_snapshot_date date, p_period_days integer, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_artist uuid;
  v_count int := 0;
  v_changed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sem sessao' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    has_role(v_uid, 'admin'::app_role)
    OR has_role(v_uid, 'platform_admin'::app_role)
    OR has_role(v_uid, 'manager'::app_role)
    OR has_role(v_uid, 'marketing_manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'papel sem permissao para gravar streams por playlist' USING ERRCODE = '42501';
  END IF;

  SELECT s.company_id, s.artist_id INTO v_company, v_artist
  FROM public.artist_songs s WHERE s.id = p_song_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'musica inexistente' USING ERRCODE = 'P0002';
  END IF;

  IF NOT has_role(v_uid, 'platform_admin'::app_role)
     AND v_company IS DISTINCT FROM current_company_id() THEN
    RAISE EXCEPTION 'musica de outra empresa' USING ERRCODE = '42501';
  END IF;

  -- Valor novo ou diferente? (antes da gravação; regravações idênticas não marcam)
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) AS r
      LEFT JOIN public.artist_song_playlist_streams t
        ON t.song_id = p_song_id
       AND t.snapshot_date = p_snapshot_date
       AND t.period_days = coalesce(p_period_days, 28)
       AND t.playlist_name = btrim(r->>'playlist_name')
    WHERE btrim(coalesce(r->>'playlist_name','')) <> ''
      AND (
        t.song_id IS NULL
        OR t.streams IS DISTINCT FROM NULLIF(r->>'streams','')::int
        OR t.rank IS DISTINCT FROM NULLIF(r->>'rank','')::int
        OR t.made_by IS DISTINCT FROM NULLIF(r->>'made_by','')
        OR t.date_added IS DISTINCT FROM NULLIF(r->>'date_added','')::date
      )
  ) INTO v_changed;

  WITH src AS (
    SELECT
      NULLIF(r->>'rank','')::int              AS rank,
      btrim(r->>'playlist_name')              AS playlist_name,
      NULLIF(r->>'made_by','')                AS made_by,
      NULLIF(r->>'streams','')::int           AS streams,
      NULLIF(r->>'date_added','')::date       AS date_added
    FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) AS r
    WHERE btrim(coalesce(r->>'playlist_name','')) <> ''
  ), ins AS (
    INSERT INTO public.artist_song_playlist_streams
      (company_id, artist_id, song_id, snapshot_date, period_days,
       rank, playlist_name, made_by, streams, date_added, source)
    SELECT v_company, v_artist, p_song_id, p_snapshot_date,
           coalesce(p_period_days, 28),
           src.rank, src.playlist_name, src.made_by, src.streams,
           src.date_added, 's4a_manual'
    FROM src
    ON CONFLICT (song_id, snapshot_date, period_days, playlist_name) DO UPDATE
      SET rank = EXCLUDED.rank,
          made_by = EXCLUDED.made_by,
          streams = EXCLUDED.streams,
          date_added = EXCLUDED.date_added,
          artist_id = EXCLUDED.artist_id,
          source = EXCLUDED.source
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  IF v_changed THEN
    PERFORM public.artist_song_mark_report_stale(p_song_id);
  END IF;

  INSERT INTO public.system_audit_log
    (entity_type, entity_id, action, changed_by, new_data, company_id)
  VALUES (
    'artist_song_playlist_streams', p_song_id, 'set', v_uid::text,
    jsonb_build_object('snapshot_date', p_snapshot_date,
                       'period_days', coalesce(p_period_days, 28),
                       'rows', v_count),
    v_company
  );

  RETURN v_count;
END;
$function$;