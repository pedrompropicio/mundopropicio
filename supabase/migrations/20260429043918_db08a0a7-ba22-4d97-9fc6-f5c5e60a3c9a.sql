REVOKE EXECUTE ON FUNCTION public.run_rls_isolation_test() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_rls_isolation_test() TO service_role;