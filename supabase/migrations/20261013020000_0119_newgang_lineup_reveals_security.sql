-- A: segurança do line-up
DROP POLICY IF EXISTS event_lineups_authenticated_all ON public.event_lineups;
CREATE POLICY event_lineups_select ON public.event_lineups FOR SELECT TO authenticated USING (true);
CREATE POLICY event_lineups_write_admin ON public.event_lineups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin'));

-- B: revelações
CREATE TABLE public.event_lineup_reveals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  label text NOT NULL,
  club_at timestamptz NOT NULL,
  public_at timestamptz NOT NULL,
  clues text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','agendada')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (public_at >= club_at)
);
CREATE INDEX event_lineup_reveals_event_idx ON public.event_lineup_reveals(event_id, public_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_lineup_reveals TO authenticated;
GRANT ALL ON public.event_lineup_reveals TO service_role;
ALTER TABLE public.event_lineup_reveals ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_isolation_event_lineup_reveals ON public.event_lineup_reveals AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));
CREATE POLICY event_lineup_reveals_select ON public.event_lineup_reveals FOR SELECT TO authenticated USING (true);
CREATE POLICY event_lineup_reveals_write_admin ON public.event_lineup_reveals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin'));

ALTER TABLE public.event_lineups
  ADD COLUMN reveal_id uuid REFERENCES public.event_lineup_reveals(id) ON DELETE SET NULL,
  ADD COLUMN category text NOT NULL DEFAULT 'atracao' CHECK (category IN ('headliner','atracao','convidado')),
  ADD COLUMN video_url text,
  ADD COLUMN listen_url text;
ALTER TABLE public.event_marketing ADD COLUMN lineup_complete boolean NOT NULL DEFAULT false;

-- Vista pública: só atrações com revelação agendada e public_at já passado
CREATE OR REPLACE VIEW public.event_lineups_public AS
 SELECT l.id, l.event_id, e.slug AS event_slug, l.artist_name, l.artist_image_url,
        l.artist_bio_pt, l.artist_bio_en, l.stage, l.performance_date, l.performance_time, l.display_order
   FROM public.event_lineups l
   JOIN public.events e ON e.id = l.event_id
   JOIN public.event_lineup_reveals r ON r.id = l.reveal_id
  WHERE e.portal_visible = true AND e.slug IS NOT NULL
    AND r.status = 'agendada' AND r.public_at <= now();
REVOKE ALL ON public.event_lineups_public FROM anon;
GRANT SELECT ON public.event_lineups_public TO anon, authenticated;