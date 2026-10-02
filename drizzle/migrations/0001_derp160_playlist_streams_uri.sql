-- D-ERP160 (2): artist_song_playlist_streams identifica a playlist pelo URI do S4A (fallback: nome).
ALTER TABLE public.artist_song_playlist_streams ADD COLUMN IF NOT EXISTS playlist_uri text;
-- Chave derivada = coalesce(playlist_uri, 'name:' || playlist_name). Coluna gerada para o upsert do PostgREST (onConflict só aceita colunas).
ALTER TABLE public.artist_song_playlist_streams
  ADD COLUMN IF NOT EXISTS playlist_key text GENERATED ALWAYS AS (coalesce(playlist_uri, 'name:' || playlist_name)) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS artist_song_playlist_streams_song_snap_period_key_uidx
  ON public.artist_song_playlist_streams (song_id, snapshot_date, period_days, playlist_key);
ALTER TABLE public.artist_song_playlist_streams DROP CONSTRAINT IF EXISTS artist_song_playlist_streams_song_id_snapshot_date_period_d_key;

-- RPC manual: sem uri → chave 'name:'||nome.
DO $mig$
DECLARE
  d text := pg_get_functiondef('public.artist_song_playlist_streams_set(uuid,date,integer,jsonb)'::regprocedure);
  a1 text := 'AND t.playlist_name = btrim(r->>''playlist_name'')';
  a2 text := 'ON CONFLICT (song_id, snapshot_date, period_days, playlist_name) DO UPDATE';
BEGIN
  IF position(a1 in d) = 0 OR position(a2 in d) = 0 THEN
    IF position('playlist_key' in d) > 0 THEN RETURN; END IF;
    RAISE EXCEPTION 'artist_song_playlist_streams_set: âncoras não encontradas';
  END IF;
  d := replace(d, a1, 'AND t.playlist_key = ''name:'' || btrim(r->>''playlist_name'')');
  d := replace(d, a2, 'ON CONFLICT (song_id, snapshot_date, period_days, playlist_key) DO UPDATE');
  EXECUTE d;
END
$mig$;
REVOKE ALL ON FUNCTION public.artist_song_playlist_streams_set(uuid, date, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_song_playlist_streams_set(uuid, date, integer, jsonb) TO authenticated, service_role;