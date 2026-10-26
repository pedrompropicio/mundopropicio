CREATE INDEX IF NOT EXISTS song_link_events_artist_event_created_idx ON public.song_link_events (artist_id, event, created_at);
