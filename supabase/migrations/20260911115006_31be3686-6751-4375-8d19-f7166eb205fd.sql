-- ============================================================
-- Carreira Artística — lançamentos e métricas diárias
-- ============================================================

CREATE TABLE public.artist_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('spotify','youtube','instagram','tiktok','deezer','apple_music','sua_musica','facebook','soundcloud')),
  external_id text NOT NULL,
  title text NOT NULL,
  url text,
  release_type text CHECK (release_type IS NULL OR release_type IN ('album','single','ep','ao_vivo','compilacao','outro')),
  published_at timestamptz,
  uploader_handle text,
  is_official boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_releases_artist_platform_ext_key UNIQUE (artist_id, platform, external_id)
);
CREATE INDEX idx_artist_releases_artist ON public.artist_releases(artist_id);
CREATE INDEX idx_artist_releases_artist_published ON public.artist_releases(artist_id, published_at DESC);
CREATE INDEX idx_artist_releases_company ON public.artist_releases(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_releases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_releases TO service_role;
ALTER TABLE public.artist_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist_releases_select" ON public.artist_releases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "artist_releases_insert" ON public.artist_releases
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "artist_releases_update" ON public.artist_releases
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'))
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "artist_releases_delete" ON public.artist_releases
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "company_isolation_artist_releases" ON public.artist_releases
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.artist_releases
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();
CREATE TRIGGER trg_artist_releases_updated_at BEFORE UPDATE ON public.artist_releases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.artist_release_metrics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  release_id uuid NOT NULL REFERENCES public.artist_releases(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('spotify','youtube','instagram','tiktok','deezer','apple_music','sua_musica','facebook','soundcloud')),
  metric text NOT NULL,
  metric_date date NOT NULL,
  value numeric NOT NULL,
  source text NOT NULL,
  source_ref text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_release_metrics_daily_unique_key UNIQUE (release_id, metric, metric_date, source)
);
CREATE INDEX idx_artist_release_metrics_artist_date ON public.artist_release_metrics_daily(artist_id, metric_date);
CREATE INDEX idx_artist_release_metrics_release_date ON public.artist_release_metrics_daily(release_id, metric_date);
CREATE INDEX idx_artist_release_metrics_company ON public.artist_release_metrics_daily(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_release_metrics_daily TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_release_metrics_daily TO service_role;
ALTER TABLE public.artist_release_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist_release_metrics_daily_select" ON public.artist_release_metrics_daily
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "artist_release_metrics_daily_insert" ON public.artist_release_metrics_daily
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "artist_release_metrics_daily_update" ON public.artist_release_metrics_daily
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'))
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "artist_release_metrics_daily_delete" ON public.artist_release_metrics_daily
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "company_isolation_artist_release_metrics_daily" ON public.artist_release_metrics_daily
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.artist_release_metrics_daily
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();