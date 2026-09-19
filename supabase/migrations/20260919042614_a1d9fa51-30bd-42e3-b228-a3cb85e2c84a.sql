-- D-ERP94: REVOKE de PUBLIC e anon + GRANT a authenticated/service_role nas RPCs artist_ads_*
-- Idempotente: repete o estado já aplicado manualmente em Live a 19/09/2026.
-- Regra: artist_ads_assert_access deixa passar sem sessão de propósito (cron) — a protecção é o privilégio, não o corpo.

REVOKE EXECUTE ON FUNCTION public.artist_ads_assert_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_campaigns(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_daily(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_ads(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_alerts(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_autolink_songs(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_link_song(text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.artist_ads_unlink_song(text, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.artist_ads_assert_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_campaigns(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_daily(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_ads(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_alerts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_autolink_songs(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_link_song(text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_unlink_song(text, text, uuid) TO authenticated, service_role;