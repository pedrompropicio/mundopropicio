GRANT SELECT ON public.portal_settings TO anon;

DROP POLICY IF EXISTS portal_settings_select_public ON public.portal_settings;
CREATE POLICY portal_settings_select_public ON public.portal_settings FOR SELECT TO anon USING (true);