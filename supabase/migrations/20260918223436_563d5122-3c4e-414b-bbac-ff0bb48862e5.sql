REVOKE ALL ON public.secret_expirations FROM anon;
REVOKE ALL ON public.secret_expirations FROM authenticated;
REVOKE ALL ON public.secret_expirations FROM PUBLIC;
GRANT ALL ON public.secret_expirations TO service_role;