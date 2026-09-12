ALTER VIEW public.v_song_report_latest SET (security_invoker = on);
GRANT SELECT ON public.v_song_report_latest TO authenticated;