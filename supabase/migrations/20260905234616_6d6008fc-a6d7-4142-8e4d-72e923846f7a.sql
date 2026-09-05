REVOKE EXECUTE ON FUNCTION public.seed_sponsorship_segments(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_seed_sponsorship_segments() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_est_baseline_and_touch() FROM anon, authenticated, public;