CREATE TABLE public.artist_song_playlist_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  artist_id uuid REFERENCES public.artists(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES public.artist_songs(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  period_days int NOT NULL DEFAULT 28,
  rank int,
  playlist_name text NOT NULL,
  made_by text CHECK (made_by IN ('spotify','user')),
  streams int,
  date_added date,
  source text NOT NULL DEFAULT 's4a_manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (song_id, snapshot_date, period_days, playlist_name)
);

CREATE INDEX idx_asps_song_snapshot ON public.artist_song_playlist_streams (song_id, snapshot_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_song_playlist_streams TO authenticated;
GRANT ALL ON public.artist_song_playlist_streams TO service_role;

ALTER TABLE public.artist_song_playlist_streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY artist_song_playlist_streams_select
  ON public.artist_song_playlist_streams FOR SELECT TO authenticated USING (true);

CREATE POLICY company_isolation_artist_song_playlist_streams
  ON public.artist_song_playlist_streams AS RESTRICTIVE FOR ALL TO authenticated
  USING (row_belongs_to_current_company(company_id))
  WITH CHECK (row_belongs_to_current_company(company_id));

CREATE POLICY artist_song_playlist_streams_write
  ON public.artist_song_playlist_streams FOR ALL TO authenticated
  USING (
    has_role((SELECT auth.uid()), 'admin'::app_role)
    OR has_role((SELECT auth.uid()), 'platform_admin'::app_role)
    OR has_role((SELECT auth.uid()), 'manager'::app_role)
    OR has_role((SELECT auth.uid()), 'editor'::app_role)
  )
  WITH CHECK (
    has_role((SELECT auth.uid()), 'admin'::app_role)
    OR has_role((SELECT auth.uid()), 'platform_admin'::app_role)
    OR has_role((SELECT auth.uid()), 'manager'::app_role)
    OR has_role((SELECT auth.uid()), 'editor'::app_role)
  );

CREATE OR REPLACE FUNCTION public.artist_song_playlist_streams_set(
  p_song_id uuid,
  p_snapshot_date date,
  p_period_days int,
  p_rows jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_artist uuid;
  v_count int := 0;
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
$$;

REVOKE ALL ON FUNCTION public.artist_song_playlist_streams_set(uuid, date, int, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.artist_song_playlist_streams_set(uuid, date, int, jsonb) TO authenticated;

CREATE OR REPLACE VIEW public.v_song_playlist_streams_latest
WITH (security_invoker = true) AS
WITH latest AS (
  SELECT song_id, period_days, max(snapshot_date) AS snapshot_date
  FROM public.artist_song_playlist_streams
  GROUP BY song_id, period_days
), rows AS (
  SELECT p.*
  FROM public.artist_song_playlist_streams p
  JOIN latest l
    ON l.song_id = p.song_id
   AND l.period_days = p.period_days
   AND l.snapshot_date = p.snapshot_date
), tot AS (
  SELECT song_id, period_days, snapshot_date,
         count(*) AS playlists_na_snapshot,
         sum(coalesce(streams,0)) AS streams_total,
         sum(CASE WHEN made_by = 'spotify' THEN coalesce(streams,0) ELSE 0 END) AS streams_spotify_owned,
         sum(CASE WHEN made_by = 'user' THEN coalesce(streams,0) ELSE 0 END) AS streams_user_playlists
  FROM rows GROUP BY song_id, period_days, snapshot_date
), top10 AS (
  SELECT song_id, period_days, snapshot_date,
         sum(coalesce(streams,0)) AS streams_top10
  FROM (
    SELECT song_id, period_days, snapshot_date, streams,
           row_number() OVER (PARTITION BY song_id, period_days
                              ORDER BY coalesce(streams,0) DESC) AS rn
    FROM rows
  ) x WHERE rn <= 10
  GROUP BY song_id, period_days, snapshot_date
)
SELECT
  r.id, r.company_id, r.artist_id, r.song_id, r.snapshot_date, r.period_days,
  r.rank, r.playlist_name, r.made_by, r.streams, r.date_added, r.source,
  s.title AS song_title,
  t.playlists_na_snapshot, t.streams_total, t.streams_spotify_owned,
  t.streams_user_playlists, t10.streams_top10,
  sc.subscriber_count AS soundcharts_subscribers,
  sc.playlist_type    AS soundcharts_playlist_type,
  sc.position         AS soundcharts_position
FROM rows r
JOIN public.artist_songs s ON s.id = r.song_id
JOIN tot t ON t.song_id = r.song_id AND t.period_days = r.period_days AND t.snapshot_date = r.snapshot_date
LEFT JOIN top10 t10 ON t10.song_id = r.song_id AND t10.period_days = r.period_days AND t10.snapshot_date = r.snapshot_date
LEFT JOIN LATERAL (
  SELECT p.subscriber_count, p.playlist_type, p.position
  FROM public.artist_song_playlists p
  WHERE p.song_id = r.song_id
    AND lower(btrim(p.playlist_name)) = lower(btrim(r.playlist_name))
  ORDER BY p.exit_date NULLS FIRST, p.last_seen_at DESC NULLS LAST
  LIMIT 1
) sc ON true;

GRANT SELECT ON public.v_song_playlist_streams_latest TO authenticated;
GRANT SELECT ON public.v_song_playlist_streams_latest TO service_role;