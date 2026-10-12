-- Issue #309: fechar grants de public.fever_buyers (default privileges tinham dado acesso largo).
REVOKE ALL ON public.fever_buyers FROM anon;
REVOKE ALL ON public.fever_buyers FROM authenticated;
REVOKE ALL ON public.fever_buyers FROM service_role;
GRANT SELECT ON public.fever_buyers TO authenticated;
GRANT ALL ON public.fever_buyers TO service_role;