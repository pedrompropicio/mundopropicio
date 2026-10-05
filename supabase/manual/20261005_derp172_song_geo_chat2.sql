-- D-ERP172 adenda — JÁ APLICADO EM LIVE a 05/10/2026 pelo chat 2 (autorização do Pedro). NÃO voltar a aplicar.
ALTER TABLE public.artist_audience_demographics
  ADD COLUMN IF NOT EXISTS song_id uuid NULL REFERENCES public.artist_songs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_aad_song ON public.artist_audience_demographics (song_id) WHERE song_id IS NOT NULL;
-- uq_artist_audience_demographics → UNIQUE NULLS NOT DISTINCT
--   (artist_id, platform, audience_type, dimension, dim_key, snapshot_date, song_id)
-- artist_audience_set_manual: ON CONFLICT passou a incluir song_id (ACL igual).

-- PROPOSTA (AGUARDA PEDRO, não aplicada): o CHECK de audience_type não aceita 'streams'.
-- ALTER TABLE public.artist_audience_demographics DROP CONSTRAINT artist_audience_demographics_audience_type_check;
-- ALTER TABLE public.artist_audience_demographics ADD CONSTRAINT artist_audience_demographics_audience_type_check
--   CHECK (audience_type = ANY (ARRAY['followers','engaged','reached','listeners','streams']));
