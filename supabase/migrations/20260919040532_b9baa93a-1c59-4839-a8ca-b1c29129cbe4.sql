-- D-ERP92: os privilégios por omissão do schema public dão tudo a anon/authenticated.
-- A tabela de câmbios é leitura para authenticated e escrita só para service_role.
REVOKE ALL ON public.fx_rates_daily FROM anon;
REVOKE ALL ON public.fx_rates_daily FROM authenticated;
GRANT SELECT ON public.fx_rates_daily TO authenticated;
GRANT ALL ON public.fx_rates_daily TO service_role;

DROP POLICY IF EXISTS fx_rates_daily_select_authenticated ON public.fx_rates_daily;
CREATE POLICY fx_rates_daily_select_authenticated
  ON public.fx_rates_daily FOR SELECT TO authenticated USING (true);