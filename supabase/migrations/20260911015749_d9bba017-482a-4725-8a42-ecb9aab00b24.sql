-- ============================================================
-- Carreira Artística — fundação (4 tabelas)
-- ============================================================

-- 1) artists
CREATE TABLE public.artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  name text NOT NULL,
  slug text NOT NULL,
  kind text NOT NULL DEFAULT 'musica' CHECK (kind IN ('musica','humor','palestra','digital','outro')),
  managed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  genre text,
  city text,
  career_start_year int,
  photo_url text,
  bio_pt text,
  bio_en text,
  meta_pixel_id text,
  tiktok_pixel_code text,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artists_company_slug_key UNIQUE (company_id, slug)
);
CREATE INDEX idx_artists_company ON public.artists(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artists TO service_role;
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artists_select" ON public.artists
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "artists_insert" ON public.artists
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "artists_update" ON public.artists
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'))
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "artists_delete" ON public.artists
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "company_isolation_artists" ON public.artists
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.artists
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();
CREATE TRIGGER trg_artists_updated_at BEFORE UPDATE ON public.artists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) artist_aliases
CREATE TABLE public.artist_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_norm text GENERATED ALWAYS AS (lower(btrim(alias))) STORED,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_aliases_company_alias_key UNIQUE (company_id, alias_norm)
);
CREATE INDEX idx_artist_aliases_artist ON public.artist_aliases(artist_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_aliases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_aliases TO service_role;
ALTER TABLE public.artist_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist_aliases_select" ON public.artist_aliases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "artist_aliases_insert" ON public.artist_aliases
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "artist_aliases_update" ON public.artist_aliases
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'))
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "artist_aliases_delete" ON public.artist_aliases
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "company_isolation_artist_aliases" ON public.artist_aliases
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.artist_aliases
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- 3) artist_channels
CREATE TABLE public.artist_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('spotify','youtube','instagram','tiktok','deezer','apple_music','sua_musica','facebook','soundcloud','aggregator')),
  handle text,
  external_id text,
  url text,
  account_type text CHECK (account_type IN ('personal','creator','business','artist')),
  auth_status text NOT NULL DEFAULT 'none' CHECK (auth_status IN ('none','authorized','expired','revoked')),
  is_primary boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_channels_artist_platform_ext_key UNIQUE (artist_id, platform, external_id)
);
CREATE INDEX idx_artist_channels_artist ON public.artist_channels(artist_id);
CREATE INDEX idx_artist_channels_company ON public.artist_channels(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_channels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_channels TO service_role;
ALTER TABLE public.artist_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist_channels_select" ON public.artist_channels
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "artist_channels_insert" ON public.artist_channels
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "artist_channels_update" ON public.artist_channels
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'))
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "artist_channels_delete" ON public.artist_channels
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "company_isolation_artist_channels" ON public.artist_channels
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.artist_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();
CREATE TRIGGER trg_artist_channels_updated_at BEFORE UPDATE ON public.artist_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) artist_metrics_daily
CREATE TABLE public.artist_metrics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.artist_channels(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('spotify','youtube','instagram','tiktok','deezer','apple_music','sua_musica','facebook','soundcloud','aggregator')),
  metric text NOT NULL,
  metric_date date NOT NULL,
  value numeric NOT NULL,
  source text NOT NULL,
  source_ref text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_metrics_daily_unique_key UNIQUE (artist_id, platform, metric, metric_date, source)
);
CREATE INDEX idx_artist_metrics_artist_date ON public.artist_metrics_daily(artist_id, metric_date);
CREATE INDEX idx_artist_metrics_company ON public.artist_metrics_daily(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_metrics_daily TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_metrics_daily TO service_role;
ALTER TABLE public.artist_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist_metrics_daily_select" ON public.artist_metrics_daily
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "artist_metrics_daily_insert" ON public.artist_metrics_daily
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "artist_metrics_daily_update" ON public.artist_metrics_daily
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'))
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "artist_metrics_daily_delete" ON public.artist_metrics_daily
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "company_isolation_artist_metrics_daily" ON public.artist_metrics_daily
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.artist_metrics_daily
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();