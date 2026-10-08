-- D-ERP141 adenda: links de playlist (song_id NULL) contam como "música" própria no alarme de queda.
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.song_link_health_run(date)'::regprocedure);
  n := replace(d, E'SELECT l.song_id,\n      count(*) FILTER', E'SELECT coalesce(l.song_id, l.id) AS song_id,\n      count(*) FILTER');
  n := replace(n, 'l.song_id = ANY(v_drop)', 'coalesce(l.song_id, l.id) = ANY(v_drop)');
  IF n = d OR position('coalesce(l.song_id, l.id) AS song_id' in n) = 0 THEN
    RAISE EXCEPTION 'song_link_health_run: padrão não encontrado';
  END IF;
  EXECUTE n;
END $$;