SET lock_timeout = '5s';

ALTER TABLE public.artist_audience_demographics
  DROP CONSTRAINT IF EXISTS artist_audience_demographics_audience_type_check;

ALTER TABLE public.artist_audience_demographics
  ADD CONSTRAINT artist_audience_demographics_audience_type_check
  CHECK (audience_type = ANY (ARRAY['followers'::text, 'engaged'::text, 'reached'::text, 'listeners'::text]));