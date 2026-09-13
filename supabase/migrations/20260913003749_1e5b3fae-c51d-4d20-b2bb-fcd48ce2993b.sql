REVOKE EXECUTE ON FUNCTION public.user_settlement_ids(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_settlement_visible_ids(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_settlement_staff(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.settlement_local_partners_pct(uuid) FROM anon;