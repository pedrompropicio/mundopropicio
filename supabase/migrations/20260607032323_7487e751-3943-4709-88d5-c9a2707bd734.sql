CREATE TABLE public.home_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  title_pt text NOT NULL,
  title_en text,
  youtube_id text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  portal_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE INDEX home_videos_company_id_idx ON public.home_videos(company_id);
CREATE INDEX home_videos_display_order_idx ON public.home_videos(company_id, display_order);
CREATE INDEX home_videos_portal_visible_idx ON public.home_videos(company_id, portal_visible) WHERE portal_visible = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_videos TO authenticated;
GRANT ALL ON public.home_videos TO service_role;

CREATE TRIGGER home_videos_set_updated_at
  BEFORE UPDATE ON public.home_videos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.home_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "home_videos_select_company" ON public.home_videos
  FOR SELECT TO authenticated
  USING (public.row_belongs_to_current_company(company_id));

CREATE POLICY "home_videos_insert_company" ON public.home_videos
  FOR INSERT TO authenticated
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE POLICY "home_videos_update_company" ON public.home_videos
  FOR UPDATE TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE POLICY "home_videos_delete_company" ON public.home_videos
  FOR DELETE TO authenticated
  USING (public.row_belongs_to_current_company(company_id));

CREATE OR REPLACE VIEW public.home_videos_public WITH (security_invoker = true) AS
SELECT
  hv.id,
  hv.company_id,
  hv.event_id,
  hv.title_pt,
  hv.title_en,
  hv.youtube_id,
  hv.display_order,
  e.slug AS event_slug
FROM public.home_videos hv
LEFT JOIN public.events e ON e.id = hv.event_id
WHERE hv.portal_visible = true;

GRANT SELECT ON public.home_videos_public TO anon, authenticated;