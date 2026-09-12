REVOKE EXECUTE ON FUNCTION public.trg_event_partners_mirror() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_event_partners_mirror() TO service_role;