COMMENT ON COLUMN public.artist_songs.smart_link_url IS 'DEPRECATED 2026-09-26 — usar public.song_links; mantida só para histórico, não escrever mais aqui';

REVOKE EXECUTE ON FUNCTION public.artist_ads_song_set_smart_link FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.artist_ads_song_set_smart_link FROM anon;