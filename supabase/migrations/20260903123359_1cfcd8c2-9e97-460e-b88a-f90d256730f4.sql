REVOKE ALL ON FUNCTION public.zone_capacity_snapshot(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.normalize_zone_label(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.zone_capacity_snapshot(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_zone_label(text) TO authenticated, service_role;