-- ============================================================
-- Carreira Artística — comparáveis por artista
-- ============================================================

-- 1a) roster_type em artists
ALTER TABLE public.artists
  ADD COLUMN roster_type text NOT NULL DEFAULT 'elenco'
    CHECK (roster_type IN ('elenco','referencia'));

COMMENT ON COLUMN public.artists.roster_type IS
  'elenco = artista gerido pela empresa; referencia = artista comparável importado da Soundcharts.';

CREATE INDEX idx_artists_roster_type ON public.artists(company_id, roster_type);

-- 1b) artist_comparables
CREATE TABLE public.artist_comparables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  comparable_artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  "position" smallint NOT NULL CHECK ("position" BETWEEN 1 AND 5),
  reason text,
  chosen_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_comparables_artist_position_key UNIQUE (artist_id, "position"),
  CONSTRAINT artist_comparables_artist_comparable_key UNIQUE (artist_id, comparable_artist_id),
  CONSTRAINT artist_comparables_not_self CHECK (artist_id <> comparable_artist_id)
);

CREATE INDEX idx_artist_comparables_artist ON public.artist_comparables(artist_id);
CREATE INDEX idx_artist_comparables_comparable ON public.artist_comparables(comparable_artist_id);
CREATE INDEX idx_artist_comparables_company ON public.artist_comparables(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_comparables TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_comparables TO service_role;
ALTER TABLE public.artist_comparables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist_comparables_select" ON public.artist_comparables
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "artist_comparables_insert" ON public.artist_comparables
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "artist_comparables_update" ON public.artist_comparables
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'))
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "artist_comparables_delete" ON public.artist_comparables
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor'));
CREATE POLICY "company_isolation_artist_comparables" ON public.artist_comparables
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.artist_comparables
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- trava explícita de 5 comparáveis por artista
CREATE OR REPLACE FUNCTION public.enforce_artist_comparables_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.artist_comparables c
   WHERE c.artist_id = NEW.artist_id
     AND c.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  IF v_count >= 5 THEN
    RAISE EXCEPTION 'Máximo de 5 comparáveis por artista (artist_id=%)', NEW.artist_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_artist_comparables_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_artist_comparables_limit() FROM anon, authenticated;

CREATE TRIGGER trg_artist_comparables_limit
  BEFORE INSERT OR UPDATE OF artist_id ON public.artist_comparables
  FOR EACH ROW EXECUTE FUNCTION public.enforce_artist_comparables_limit();

-- 1c) v_artist_comparables
CREATE OR REPLACE VIEW public.v_artist_comparables
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.company_id,
  c.artist_id,
  a.name  AS artist_name,
  a.slug  AS artist_slug,
  c.comparable_artist_id,
  b.name       AS comparable_name,
  b.slug       AS comparable_slug,
  b.photo_url  AS comparable_photo_url,
  b.roster_type AS comparable_roster_type,
  c."position",
  c.reason,
  c.chosen_by,
  c.created_at,
  -- comparável
  cs.value AS comparable_spotify_monthly_listeners,
  ci.value AS comparable_instagram_followers,
  ct.value AS comparable_tiktok_followers,
  cy.value AS comparable_youtube_subscribers,
  -- artista do elenco
  as_.value AS artist_spotify_monthly_listeners,
  ai.value  AS artist_instagram_followers,
  at_.value AS artist_tiktok_followers,
  ay.value  AS artist_youtube_subscribers
FROM public.artist_comparables c
JOIN public.artists a ON a.id = c.artist_id
JOIN public.artists b ON b.id = c.comparable_artist_id
LEFT JOIN public.v_artist_metric_latest cs
  ON cs.artist_id = c.comparable_artist_id AND cs.platform = 'spotify'   AND cs.metric = 'monthly_listeners'
LEFT JOIN public.v_artist_metric_latest ci
  ON ci.artist_id = c.comparable_artist_id AND ci.platform = 'instagram' AND ci.metric = 'followers'
LEFT JOIN public.v_artist_metric_latest ct
  ON ct.artist_id = c.comparable_artist_id AND ct.platform = 'tiktok'    AND ct.metric = 'followers'
LEFT JOIN public.v_artist_metric_latest cy
  ON cy.artist_id = c.comparable_artist_id AND cy.platform = 'youtube'   AND cy.metric = 'subscribers'
LEFT JOIN public.v_artist_metric_latest as_
  ON as_.artist_id = c.artist_id AND as_.platform = 'spotify'   AND as_.metric = 'monthly_listeners'
LEFT JOIN public.v_artist_metric_latest ai
  ON ai.artist_id = c.artist_id AND ai.platform = 'instagram' AND ai.metric = 'followers'
LEFT JOIN public.v_artist_metric_latest at_
  ON at_.artist_id = c.artist_id AND at_.platform = 'tiktok'    AND at_.metric = 'followers'
LEFT JOIN public.v_artist_metric_latest ay
  ON ay.artist_id = c.artist_id AND ay.platform = 'youtube'   AND ay.metric = 'subscribers';

COMMENT ON VIEW public.v_artist_comparables IS
  'Comparáveis por artista (até 5) com os valores mais recentes das métricas principais do comparável e do artista. NULL quando não há leitura.';

-- 1d) v_artist_momentum
CREATE OR REPLACE VIEW public.v_artist_momentum
WITH (security_invoker = true) AS
WITH mains(platform, metric) AS (
  VALUES ('spotify','monthly_listeners'),
         ('instagram','followers'),
         ('tiktok','followers'),
         ('youtube','subscribers')
),
base AS (
  SELECT l.company_id, l.artist_id, a.name AS artist_name, a.roster_type,
         l.platform, l.metric, l.metric_date AS latest_date, l.value AS latest_value
  FROM public.v_artist_metric_latest l
  JOIN public.artists a ON a.id = l.artist_id
  JOIN mains m ON m.platform = l.platform AND m.metric = l.metric
)
SELECT
  b.company_id, b.artist_id, b.artist_name, b.roster_type,
  b.platform, b.metric, b.latest_date, b.latest_value,
  g7.delta_pct  AS d7_pct,
  g30.delta_pct AS d30_pct,
  g90.delta_pct AS d90_pct,
  CASE
    WHEN g7.delta_pct IS NULL OR g30.delta_pct IS NULL OR g90.delta_pct IS NULL THEN NULL
    ELSE round(g7.delta_pct * 0.5 + g30.delta_pct * 0.3 + g90.delta_pct * 0.2, 2)
  END AS momentum_index
FROM base b
LEFT JOIN LATERAL (
  SELECT g.delta_pct FROM public.artist_metric_growth(b.artist_id, 7) g
   WHERE g.platform = b.platform AND g.metric = b.metric LIMIT 1
) g7 ON true
LEFT JOIN LATERAL (
  SELECT g.delta_pct FROM public.artist_metric_growth(b.artist_id, 30) g
   WHERE g.platform = b.platform AND g.metric = b.metric LIMIT 1
) g30 ON true
LEFT JOIN LATERAL (
  SELECT g.delta_pct FROM public.artist_metric_growth(b.artist_id, 90) g
   WHERE g.platform = b.platform AND g.metric = b.metric LIMIT 1
) g90 ON true;

COMMENT ON VIEW public.v_artist_momentum IS
  'Momento por (artist_id, platform, metric) nas métricas principais: valor actual e variações 7/30/90 dias. momentum_index = 0.5*d7 + 0.3*d30 + 0.2*d90, apenas quando existem as três; NULL caso contrário.';

-- 1e) séries indexadas para um conjunto de artistas, base 100 na PRIMEIRA DATA COMUM
-- A view v_artist_metric_indexed mantém-se (base = primeiro ponto de cada série).
-- Para comparar curvas de N artistas é preciso base comum, o que exige o conjunto:
-- daí uma função e não uma view.
CREATE OR REPLACE FUNCTION public.artist_metric_indexed_common(
  _artist_ids uuid[],
  _platform   text,
  _metric     text,
  _start_date date DEFAULT NULL,
  _end_date   date DEFAULT NULL
)
RETURNS TABLE (
  company_id   uuid,
  artist_id    uuid,
  artist_name  text,
  platform     text,
  metric       text,
  metric_date  date,
  value        numeric,
  base_date    date,
  base_value   numeric,
  indexed      numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH win AS (
    SELECT m.company_id, m.artist_id, m.platform, m.metric, m.metric_date, m.value
      FROM public.artist_metrics_daily m
     WHERE m.artist_id = ANY(_artist_ids)
       AND m.platform = _platform
       AND m.metric = _metric
       AND (_start_date IS NULL OR m.metric_date >= _start_date)
       AND (_end_date   IS NULL OR m.metric_date <= _end_date)
  ),
  common AS (
    SELECT w.metric_date
      FROM win w
     GROUP BY w.metric_date
    HAVING count(DISTINCT w.artist_id) = (SELECT count(DISTINCT x.artist_id) FROM win x)
     ORDER BY w.metric_date
     LIMIT 1
  ),
  bases AS (
    SELECT DISTINCT ON (w.artist_id) w.artist_id, w.metric_date AS base_date, w.value AS base_value
      FROM win w
      JOIN common c ON c.metric_date = w.metric_date
     ORDER BY w.artist_id, w.metric_date
  )
  SELECT w.company_id, w.artist_id, a.name, w.platform, w.metric, w.metric_date, w.value,
         b.base_date, b.base_value,
         CASE WHEN b.base_value IS NULL OR b.base_value = 0 THEN NULL
              ELSE round(w.value / b.base_value * 100, 2) END
    FROM win w
    JOIN public.artists a ON a.id = w.artist_id
    LEFT JOIN bases b ON b.artist_id = w.artist_id
   ORDER BY w.artist_id, w.metric_date;
$$;

COMMENT ON FUNCTION public.artist_metric_indexed_common(uuid[], text, text, date, date) IS
  'Séries de vários artistas em base 100 na primeira data em que TODOS têm leitura no intervalo. indexed NULL se a base for 0 ou não existir data comum.';

GRANT SELECT ON public.v_artist_comparables TO authenticated, service_role;
GRANT SELECT ON public.v_artist_momentum TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_metric_indexed_common(uuid[], text, text, date, date) TO authenticated, service_role;