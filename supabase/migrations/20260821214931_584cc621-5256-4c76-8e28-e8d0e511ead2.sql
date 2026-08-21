REVOKE ALL ON FUNCTION crm.auto_link_google_campaigns_to_events(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION crm.auto_link_google_campaigns_to_events(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION crm.auto_link_google_campaigns_to_events(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crm_auto_link_google_campaigns_to_events(uuid) FROM anon;