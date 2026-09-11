ALTER TABLE public.artist_channel_connections
  DROP CONSTRAINT artist_channel_connections_provider_check;
ALTER TABLE public.artist_channel_connections
  ADD CONSTRAINT artist_channel_connections_provider_check
  CHECK (provider = ANY (ARRAY['meta'::text, 'instagram'::text, 'google'::text, 'tiktok'::text]));

ALTER TABLE public.artist_oauth_states
  DROP CONSTRAINT artist_oauth_states_provider_check;
ALTER TABLE public.artist_oauth_states
  ADD CONSTRAINT artist_oauth_states_provider_check
  CHECK (provider = ANY (ARRAY['meta'::text, 'instagram'::text, 'google'::text, 'tiktok'::text]));