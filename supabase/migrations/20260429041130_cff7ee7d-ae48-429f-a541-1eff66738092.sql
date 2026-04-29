REVOKE EXECUTE ON FUNCTION public.validate_trusted_device(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_trusted_device(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.consume_recovery_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_recovery_code(TEXT) TO authenticated;
