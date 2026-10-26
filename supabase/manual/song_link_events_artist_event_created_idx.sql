-- NOT APPLIED: concurrent index needs a supported non-transactional migration path.
CREATE INDEX CONCURRENTLY IF NOT EXISTS song_link_events_artist_event_created_idx ON public.song_link_events (artist_id, event, created_at);
