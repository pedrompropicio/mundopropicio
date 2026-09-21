-- D-ERP125 — Módulo A: UGC do TikTok por SOM (music_id), via Apify.
--
-- Não confundir com public.artist_song_tiktok_groups (D-ERP124), que é o mapa
-- das MÚSICAS do painel TikTok for Artists (group_id). Aqui tratamos dos SONS
-- (music_id), que é o que o ator do Apify conta.
--
-- NOTA: a plataforma não permite escrever em supabase/migrations/ sem aplicar a
-- migração. Como foi pedido para NÃO aplicar, o SQL fica aqui, no molde dos
-- outros ficheiros de supabase/manual/. É idempotente — pode correr-se mais de
-- uma vez sem efeito extra.

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. public.artist_song_tiktok_sounds — sons do TikTok por música
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.artist_song_tiktok_sounds (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL DEFAULT current_company_id() REFERENCES public.companies(id),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES public.artist_songs(id) ON DELETE CASCADE,
  music_id text NOT NULL,
  title text,
  author text,
  is_official boolean NOT NULL DEFAULT false,
  is_original_sound boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'candidate'
    CHECK (status = ANY (ARRAY['candidate'::text, 'validated'::text, 'rejected'::text])),
  matched_song_id text,
  discovered_via text
    CHECK (discovered_via = ANY (ARRAY['seed'::text, 'hashtag'::text, 'manual_link'::text, 'panel'::text])),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_song_tiktok_sounds_key UNIQUE (song_id, music_id)
);

CREATE INDEX IF NOT EXISTS artist_song_tiktok_sounds_music_id_idx
  ON public.artist_song_tiktok_sounds (music_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_song_tiktok_sounds TO authenticated;
GRANT ALL ON public.artist_song_tiktok_sounds TO service_role;

ALTER TABLE public.artist_song_tiktok_sounds ENABLE ROW LEVEL SECURITY;

-- Mesmas 3 políticas de public.artist_song_metrics_daily (nome e definição).
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

-- ---------------------------------------------------------------------------
-- 2. public.artist_song_tiktok_sound_daily — contagem diária por som
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.artist_song_tiktok_sound_daily (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL DEFAULT current_company_id() REFERENCES public.companies(id),
  song_id uuid NOT NULL REFERENCES public.artist_songs(id) ON DELETE CASCADE,
  music_id text NOT NULL,
  metric_date date NOT NULL,
  video_count bigint,
  source text NOT NULL DEFAULT 'apify',
  source_ref text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_song_tiktok_sound_daily_key UNIQUE (music_id, metric_date)
);

CREATE INDEX IF NOT EXISTS artist_song_tiktok_sound_daily_song_date_idx
  ON public.artist_song_tiktok_sound_daily (song_id, metric_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_song_tiktok_sound_daily TO authenticated;
GRANT ALL ON public.artist_song_tiktok_sound_daily TO service_role;

ALTER TABLE public.artist_song_tiktok_sound_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS artist_song_tiktok_sound_daily_select ON public.artist_song_tiktok_sound_daily;
CREATE POLICY artist_song_tiktok_sound_daily_select
  ON public.artist_song_tiktok_sound_daily
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS artist_song_tiktok_sound_daily_write ON public.artist_song_tiktok_sound_daily;
CREATE POLICY artist_song_tiktok_sound_daily_write
  ON public.artist_song_tiktok_sound_daily
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

DROP POLICY IF EXISTS company_isolation_artist_song_tiktok_sound_daily ON public.artist_song_tiktok_sound_daily;
CREATE POLICY company_isolation_artist_song_tiktok_sound_daily
  ON public.artist_song_tiktok_sound_daily
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (row_belongs_to_current_company(company_id))
  WITH CHECK (row_belongs_to_current_company(company_id));

-- ---------------------------------------------------------------------------
-- 3. artist_songs — hashtags e som principal do TikTok
-- ---------------------------------------------------------------------------
ALTER TABLE public.artist_songs ADD COLUMN IF NOT EXISTS tiktok_hashtags text[];
ALTER TABLE public.artist_songs ADD COLUMN IF NOT EXISTS tiktok_song_id text;

UPDATE public.artist_songs
   SET tiktok_song_id = '7681383417565775888',
       tiktok_hashtags = ARRAY['roupadesolteira', 'littolins']
 WHERE id = '74c40d7b-357b-4311-acbe-eb9bfa7ba7c7';

-- ---------------------------------------------------------------------------
-- 4. Sementes (a) — os 6 artist_song_identifiers platform='tiktok'
-- ---------------------------------------------------------------------------
INSERT INTO public.artist_song_tiktok_sounds
  (company_id, artist_id, song_id, music_id, title, is_official, is_original_sound,
   status, discovered_via, validated_at)
SELECT
  s.company_id,
  s.artist_id,
  s.id,
  i.external_id,
  s.title,
  i.external_id = '7681780720700327953',
  false,
  CASE WHEN i.external_id = '7681780720700327953' THEN 'validated' ELSE 'candidate' END,
  'seed',
  CASE WHEN i.external_id = '7681780720700327953' THEN now() ELSE NULL END
FROM public.artist_song_identifiers i
JOIN public.artist_songs s ON s.id = i.song_id
WHERE i.platform = 'tiktok'
ON CONFLICT (song_id, music_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Sementes (b) — sons de "Roupa de Solteira - Ao Vivo"
-- ---------------------------------------------------------------------------
INSERT INTO public.artist_song_tiktok_sounds
  (company_id, artist_id, song_id, music_id, is_official, is_original_sound,
   status, discovered_via, validated_at)
SELECT
  'cb5b15cb-ddaa-4cf9-bd88-4c09526e6fca'::uuid,
  'b1a53be0-e8a8-45c0-bc32-5eea23f477ed'::uuid,
  '74c40d7b-357b-4311-acbe-eb9bfa7ba7c7'::uuid,
  v.music_id,
  v.music_id = '7681780720700327953',
  v.music_id <> '7681780720700327953',
  v.status,
  'seed',
  CASE WHEN v.status = 'validated' THEN now() ELSE NULL END
FROM (VALUES
  ('7681780720700327953', 'validated'),
  ('7681781489589799701', 'validated'),
  ('7686308403223759634', 'validated'),
  ('7684607609299258129', 'validated'),
  ('7682875094741469973', 'validated'),
  ('7684405654140635911', 'validated'),
  ('7683330352215853842', 'validated'),
  ('7682963017767848725', 'validated'),
  ('7684070753105644308', 'validated'),
  ('7684073469122431762', 'validated'),
  ('7682967750419122965', 'validated'),
  ('7639364593269803794', 'validated'),
  ('7684067421136636690', 'validated'),
  ('7683736069520198407', 'validated'),
  ('7685406991234403088', 'candidate')
) AS v(music_id, status)
ON CONFLICT (song_id, music_id) DO NOTHING;
