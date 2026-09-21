-- D-ERP124 — Fase 2 do leitor do TikTok for Artists.
-- Mapa entre músicas (artist_songs) e sounds do TikTok (group_id).
--
-- NOTA: a plataforma não permite escrever em supabase/migrations/ sem aplicar a
-- migração. Como foi pedido para NÃO aplicar, o SQL fica aqui, no molde dos
-- outros ficheiros de supabase/manual/. É idempotente — pode correr-se mais de
-- uma vez sem efeito extra.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.artist_song_tiktok_sounds (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL DEFAULT current_company_id() REFERENCES public.companies(id),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES public.artist_songs(id) ON DELETE CASCADE,
  group_id text NOT NULL,
  song_name text,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_song_tiktok_sounds_key UNIQUE (song_id, group_id)
);

CREATE INDEX IF NOT EXISTS artist_song_tiktok_sounds_group_id_idx
  ON public.artist_song_tiktok_sounds (group_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_song_tiktok_sounds TO authenticated;
GRANT ALL ON public.artist_song_tiktok_sounds TO service_role;

ALTER TABLE public.artist_song_tiktok_sounds ENABLE ROW LEVEL SECURITY;

-- Mesmas políticas de public.artist_song_metrics_daily (nome e definição).
-- Em Live essa tabela tem TRÊS políticas: _select (authenticated, USING true),
-- _write (admin/platform_admin/manager/editor) e company_isolation_* RESTRICTIVE.
DROP POLICY IF EXISTS artist_song_tiktok_sounds_select ON public.artist_song_tiktok_sounds;
CREATE POLICY artist_song_tiktok_sounds_select
  ON public.artist_song_tiktok_sounds
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS artist_song_tiktok_sounds_write ON public.artist_song_tiktok_sounds;
CREATE POLICY artist_song_tiktok_sounds_write
  ON public.artist_song_tiktok_sounds
  FOR ALL TO authenticated
  USING (
    has_role((SELECT auth.uid()), 'admin'::app_role)
    OR has_role((SELECT auth.uid()), 'platform_admin'::app_role)
    OR has_role((SELECT auth.uid()), 'manager'::app_role)
    OR has_role((SELECT auth.uid()), 'editor'::app_role)
  )
  WITH CHECK (
    has_role((SELECT auth.uid()), 'admin'::app_role)
    OR has_role((SELECT auth.uid()), 'platform_admin'::app_role)
    OR has_role((SELECT auth.uid()), 'manager'::app_role)
    OR has_role((SELECT auth.uid()), 'editor'::app_role)
  );

DROP POLICY IF EXISTS company_isolation_artist_song_tiktok_sounds ON public.artist_song_tiktok_sounds;
CREATE POLICY company_isolation_artist_song_tiktok_sounds
  ON public.artist_song_tiktok_sounds
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (row_belongs_to_current_company(company_id))
  WITH CHECK (row_belongs_to_current_company(company_id));

DROP TRIGGER IF EXISTS set_artist_song_tiktok_sounds_updated_at ON public.artist_song_tiktok_sounds;
CREATE TRIGGER set_artist_song_tiktok_sounds_updated_at
  BEFORE UPDATE ON public.artist_song_tiktok_sounds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Semente: Roupa De Solteira - Ao Vivo (Litto Lins) ↔ sound 7673272066052720703
INSERT INTO public.artist_song_tiktok_sounds
  (company_id, artist_id, song_id, group_id, song_name, is_primary)
VALUES (
  'cb5b15cb-ddaa-4cf9-bd88-4c09526e6fca',
  'b1a53be0-e8a8-45c0-bc32-5eea23f477ed',
  '74c40d7b-357b-4311-acbe-eb9bfa7ba7c7',
  '7673272066052720703',
  'Roupa De Solteira - Ao Vivo',
  true
)
ON CONFLICT (song_id, group_id) DO NOTHING;
