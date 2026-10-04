-- D-ERP166 (a) — NÃO APLICADO (DDL de tabela; fica para o Pedro).
-- Permite status 'indisponivel' em artist_song_tiktok_sounds, com data e motivo.
SET lock_timeout = '5s';
ALTER TABLE public.artist_song_tiktok_sounds
  DROP CONSTRAINT IF EXISTS artist_song_tiktok_sounds_status_check;
ALTER TABLE public.artist_song_tiktok_sounds
  ADD CONSTRAINT artist_song_tiktok_sounds_status_check
  CHECK (status = ANY (ARRAY['candidate','validated','rejected','indisponivel']));
ALTER TABLE public.artist_song_tiktok_sounds
  ADD COLUMN IF NOT EXISTS unavailable_since date,
  ADD COLUMN IF NOT EXISTS unavailable_reason text;
-- Confirmar o nome real do CHECK antes de correr:
-- SELECT conname FROM pg_constraint WHERE conrelid='public.artist_song_tiktok_sounds'::regclass AND contype='c';
