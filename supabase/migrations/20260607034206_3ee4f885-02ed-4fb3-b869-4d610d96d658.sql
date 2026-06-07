CREATE TABLE public.portal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb,
  category text NOT NULL DEFAULT 'general',
  label text,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE (company_id, key)
);

CREATE INDEX portal_settings_company_idx ON public.portal_settings(company_id);
CREATE INDEX portal_settings_category_idx ON public.portal_settings(company_id, category, display_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_settings TO authenticated;
GRANT ALL ON public.portal_settings TO service_role;

CREATE TRIGGER portal_settings_set_updated_at
  BEFORE UPDATE ON public.portal_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.portal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_settings_select_company" ON public.portal_settings
  FOR SELECT TO authenticated USING (public.row_belongs_to_current_company(company_id));
CREATE POLICY "portal_settings_insert_company" ON public.portal_settings
  FOR INSERT TO authenticated WITH CHECK (public.row_belongs_to_current_company(company_id));
CREATE POLICY "portal_settings_update_company" ON public.portal_settings
  FOR UPDATE TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));
CREATE POLICY "portal_settings_delete_company" ON public.portal_settings
  FOR DELETE TO authenticated USING (public.row_belongs_to_current_company(company_id));

CREATE OR REPLACE VIEW public.portal_settings_public WITH (security_invoker = true) AS
SELECT company_id, key, value, category, display_order
FROM public.portal_settings;

GRANT SELECT ON public.portal_settings_public TO anon, authenticated;