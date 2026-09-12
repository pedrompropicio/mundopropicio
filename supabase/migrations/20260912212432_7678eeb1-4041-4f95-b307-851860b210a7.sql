CREATE TABLE public.artist_song_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  song_id uuid NOT NULL REFERENCES public.artist_songs(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  period_start date,
  period_end date,
  model text,
  input_snapshot jsonb,
  report jsonb,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error')),
  error_text text,
  generated_by text,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_song_reports TO authenticated;
GRANT ALL ON public.artist_song_reports TO service_role;

ALTER TABLE public.artist_song_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY artist_song_reports_select ON public.artist_song_reports
  FOR SELECT TO authenticated USING (true);

CREATE POLICY artist_song_reports_write ON public.artist_song_reports
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor')
  );

CREATE POLICY company_isolation_artist_song_reports ON public.artist_song_reports
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE INDEX idx_artist_song_reports_song_generated
  ON public.artist_song_reports (song_id, generated_at DESC);

CREATE VIEW public.v_song_report_latest AS
SELECT r.*
FROM public.artist_song_reports r
WHERE r.status = 'ok'
  AND r.generated_at = (
    SELECT max(r2.generated_at)
    FROM public.artist_song_reports r2
    WHERE r2.song_id = r.song_id AND r2.status = 'ok'
  );

COMMENT ON TABLE public.artist_song_reports IS
  'Relatorios de lancamento gerados por LLM. Historico: uma linha por geracao. input_snapshot e a unica fonte de numeros permitida ao modelo (D-ERP54).';