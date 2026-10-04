-- D-ERP167 (passo 4): fonte única do smart link é public.song_links.
-- DROP COLUMN fica para migração própria quando o Pedro autorizar alterações incompatíveis.
SET lock_timeout = '5s';
DROP FUNCTION public.artist_ads_song_set_smart_link(uuid, text);
COMMENT ON COLUMN public.artist_songs.smart_link_url IS 'DEPRECATED (D-ERP167): substituída por public.song_links; sem leitores nem escritores; a remover.';
