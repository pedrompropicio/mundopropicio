-- PROPOSAL ONLY: not tracked/applied. No settings rows, flag updates or activation.
-- Minimal read-only service boundary; internal gates/settings retain their existing ACL.
CREATE FUNCTION public.standalone_attempt_capability_333()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object(
  'scanner_create',coalesce((SELECT enabled FROM public.standalone_attempt_settings_333 WHERE operation='scanner_create'),false),
  'accountant_edit',coalesce((SELECT enabled FROM public.standalone_attempt_settings_333 WHERE operation='accountant_edit'),false)
 )
$$;
REVOKE ALL ON FUNCTION public.standalone_attempt_capability_333() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.standalone_attempt_capability_333() TO service_role;