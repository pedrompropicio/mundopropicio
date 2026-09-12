-- Fase A — obra/música como entidade de análise de lançamentos (Soundcharts)

-- ============================================================ 1a) artist_songs
CREATE TABLE public.artist_songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  title text NOT NULL,
  featuring text[] NOT NULL DEFAULT '{}'::text[],
  soundcharts_uuid text,
  isrc text,
  release_date date,
  cover_url text,
  tracking_status text NOT NULL DEFAULT 'ativo'
    CHECK (tracking_status IN ('ativo','pausado','arquivado')),
  is_launch boolean NOT NULL DEFAULT false,
  launch_started_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_songs_company_sc_uuid_key UNIQUE (company_id, soundcharts_uuid)
);
CREATE INDEX idx_artist_songs_artist ON public.artist_songs(artist_id);
CREATE INDEX idx_artist_songs_company ON public.artist_songs(company_id);
CREATE INDEX idx_artist_songs_tracking ON public.artist_songs(tracking_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_songs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_songs TO service_role;
ALTER TABLE public.artist_songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist_songs_select" ON public.artist_songs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "artist_songs_insert" ON public.artist_songs
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "artist_songs_update" ON public.artist_songs
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'))
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "artist_songs_delete" ON public.artist_songs
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "company_isolation_artist_songs" ON public.artist_songs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.artist_songs
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();
CREATE TRIGGER trg_artist_songs_updated_at BEFORE UPDATE ON public.artist_songs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================= 1b) artist_song_identifiers
CREATE TABLE public.artist_song_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES public.artist_songs(id) ON DELETE CASCADE,
  platform text NOT NULL,
  external_id text NOT NULL,
  url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_song_identifiers_key UNIQUE (song_id, platform, external_id)
);
CREATE INDEX idx_artist_song_identifiers_song ON public.artist_song_identifiers(song_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_song_identifiers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_song_identifiers TO service_role;
ALTER TABLE public.artist_song_identifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist_song_identifiers_select" ON public.artist_song_identifiers
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.artist_songs s
     WHERE s.id = song_id AND public.row_belongs_to_current_company(s.company_id)));
CREATE POLICY "artist_song_identifiers_write" ON public.artist_song_identifiers
  FOR ALL TO authenticated USING (
    (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
     OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'))
    AND EXISTS (SELECT 1 FROM public.artist_songs s
                 WHERE s.id = song_id AND public.row_belongs_to_current_company(s.company_id)))
  WITH CHECK (
    (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
     OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'))
    AND EXISTS (SELECT 1 FROM public.artist_songs s
                 WHERE s.id = song_id AND public.row_belongs_to_current_company(s.company_id)));

-- ================================================ 1c) artist_song_metrics_daily
CREATE TABLE public.artist_song_metrics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  song_id uuid NOT NULL REFERENCES public.artist_songs(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  platform text NOT NULL,
  metric text NOT NULL,
  metric_date date NOT NULL,
  value numeric NOT NULL,
  source text NOT NULL DEFAULT 'aggregator',
  source_ref text NOT NULL DEFAULT 'soundcharts',
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_song_metrics_daily_key
    UNIQUE (song_id, platform, metric, metric_date, source)
);
CREATE INDEX idx_asmd_song_date ON public.artist_song_metrics_daily(song_id, metric_date DESC);
CREATE INDEX idx_asmd_company ON public.artist_song_metrics_daily(company_id);
CREATE INDEX idx_asmd_artist ON public.artist_song_metrics_daily(artist_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_song_metrics_daily TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_song_metrics_daily TO service_role;
ALTER TABLE public.artist_song_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist_song_metrics_daily_select" ON public.artist_song_metrics_daily
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "artist_song_metrics_daily_write" ON public.artist_song_metrics_daily
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'))
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "company_isolation_artist_song_metrics_daily" ON public.artist_song_metrics_daily
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.artist_song_metrics_daily
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- =================================================== 1d) artist_song_playlists
CREATE TABLE public.artist_song_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  song_id uuid NOT NULL REFERENCES public.artist_songs(id) ON DELETE CASCADE,
  platform text NOT NULL,
  playlist_uuid text NOT NULL,
  playlist_name text,
  playlist_type text,
  owner_name text,
  subscriber_count integer,
  position integer,
  peak_position integer,
  entry_date date,
  exit_date date,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_song_playlists_key UNIQUE (song_id, platform, playlist_uuid)
);
CREATE INDEX idx_asp_song ON public.artist_song_playlists(song_id);
CREATE INDEX idx_asp_company ON public.artist_song_playlists(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_song_playlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_song_playlists TO service_role;
ALTER TABLE public.artist_song_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist_song_playlists_select" ON public.artist_song_playlists
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "artist_song_playlists_write" ON public.artist_song_playlists
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'))
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "company_isolation_artist_song_playlists" ON public.artist_song_playlists
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.artist_song_playlists
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- ============================== 1e) artist_releases → obra
ALTER TABLE public.artist_releases
  ADD COLUMN song_id uuid NULL REFERENCES public.artist_songs(id) ON DELETE SET NULL;
CREATE INDEX idx_artist_releases_song ON public.artist_releases(song_id);

-- ==================================================== 1f) views de leitura
CREATE OR REPLACE VIEW public.v_song_metric_latest
WITH (security_invoker = true) AS
SELECT DISTINCT ON (m.song_id, m.platform, m.metric)
  m.company_id, m.song_id, s.title AS song_title, m.artist_id,
  m.platform, m.metric, m.metric_date, m.value, m.source
FROM public.artist_song_metrics_daily m
JOIN public.artist_songs s ON s.id = m.song_id
ORDER BY m.song_id, m.platform, m.metric, m.metric_date DESC, m.captured_at DESC NULLS LAST;

COMMENT ON VIEW public.v_song_metric_latest IS
  'Último ponto por (song_id, platform, metric).';

CREATE OR REPLACE VIEW public.v_song_growth
WITH (security_invoker = true) AS
WITH latest AS (
  SELECT DISTINCT ON (m.song_id, m.platform, m.metric)
    m.company_id, m.song_id, m.artist_id, m.platform, m.metric,
    m.metric_date AS latest_date, m.value AS latest_value
  FROM public.artist_song_metrics_daily m
  ORDER BY m.song_id, m.platform, m.metric, m.metric_date DESC, m.captured_at DESC NULLS LAST
)
SELECT
  l.company_id, l.song_id, s.title AS song_title, l.artist_id,
  l.platform, l.metric, l.latest_date, l.latest_value,
  p1.metric_date AS d1_date, p1.value AS v1,
  CASE WHEN p1.value IS NULL THEN NULL ELSE l.latest_value - p1.value END AS delta_1d,
  CASE WHEN p1.value IS NULL OR p1.value = 0 THEN NULL
       ELSE round((l.latest_value - p1.value) / p1.value * 100, 2) END AS delta_1d_pct,
  p7.metric_date AS d7_date, p7.value AS v7,
  CASE WHEN p7.value IS NULL THEN NULL ELSE l.latest_value - p7.value END AS delta_7d,
  CASE WHEN p7.value IS NULL OR p7.value = 0 THEN NULL
       ELSE round((l.latest_value - p7.value) / p7.value * 100, 2) END AS delta_7d_pct,
  p30.metric_date AS d30_date, p30.value AS v30,
  CASE WHEN p30.value IS NULL THEN NULL ELSE l.latest_value - p30.value END AS delta_30d,
  CASE WHEN p30.value IS NULL OR p30.value = 0 THEN NULL
       ELSE round((l.latest_value - p30.value) / p30.value * 100, 2) END AS delta_30d_pct
FROM latest l
JOIN public.artist_songs s ON s.id = l.song_id
LEFT JOIN LATERAL (
  SELECT x.metric_date, x.value FROM public.artist_song_metrics_daily x
   WHERE x.song_id = l.song_id AND x.platform = l.platform AND x.metric = l.metric
     AND x.metric_date BETWEEN l.latest_date - 3 AND l.latest_date - 1
   ORDER BY abs(x.metric_date - (l.latest_date - 1)) LIMIT 1
) p1 ON true
LEFT JOIN LATERAL (
  SELECT x.metric_date, x.value FROM public.artist_song_metrics_daily x
   WHERE x.song_id = l.song_id AND x.platform = l.platform AND x.metric = l.metric
     AND x.metric_date BETWEEN l.latest_date - 12 AND l.latest_date - 2
   ORDER BY abs(x.metric_date - (l.latest_date - 7)) LIMIT 1
) p7 ON true
LEFT JOIN LATERAL (
  SELECT x.metric_date, x.value FROM public.artist_song_metrics_daily x
   WHERE x.song_id = l.song_id AND x.platform = l.platform AND x.metric = l.metric
     AND x.metric_date BETWEEN l.latest_date - 35 AND l.latest_date - 25
   ORDER BY abs(x.metric_date - (l.latest_date - 30)) LIMIT 1
) p30 ON true;

COMMENT ON VIEW public.v_song_growth IS
  'Variação 1d/7d/30d por (song_id, platform, metric). NULL quando a série não cobre a janela.';

CREATE OR REPLACE VIEW public.v_song_playlists_current
WITH (security_invoker = true) AS
SELECT
  p.company_id, p.song_id, s.title AS song_title, s.artist_id,
  p.platform, p.playlist_uuid, p.playlist_name, p.playlist_type, p.owner_name,
  p.subscriber_count, p.position, p.peak_position, p.entry_date, p.last_seen_at
FROM public.artist_song_playlists p
JOIN public.artist_songs s ON s.id = p.song_id
WHERE p.exit_date IS NULL
ORDER BY p.subscriber_count DESC NULLS LAST;

COMMENT ON VIEW public.v_song_playlists_current IS
  'Playlists onde a música ainda está (exit_date NULL), ordenadas por seguidores.';

GRANT SELECT ON public.v_song_metric_latest TO authenticated, service_role;
GRANT SELECT ON public.v_song_growth TO authenticated, service_role;
GRANT SELECT ON public.v_song_playlists_current TO authenticated, service_role;