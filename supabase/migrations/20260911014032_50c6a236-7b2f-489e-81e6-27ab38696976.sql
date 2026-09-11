REVOKE ALL ON FUNCTION public.force_confidential_for_restricted_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.force_confidential_for_restricted_account() FROM anon;
REVOKE ALL ON FUNCTION public.force_confidential_for_restricted_account() FROM authenticated;