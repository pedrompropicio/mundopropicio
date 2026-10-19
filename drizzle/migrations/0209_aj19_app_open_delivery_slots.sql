SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF md5(pg_get_functiondef('public.song_link_event_claim(jsonb)'::regprocedure))
     <> '0fa7ff7255cf58ace770d21abfabe2e1' THEN
    RAISE EXCEPTION 'canonical claim source changed' USING ERRCODE='55000';
  END IF;
END $$;

ALTER TABLE public.song_link_events DROP CONSTRAINT song_link_events_event_check;
ALTER TABLE public.song_link_events ADD CONSTRAINT song_link_events_event_check
  CHECK (event IN ('arrival','choice','app_open'));

ALTER TABLE public.song_link_events ADD COLUMN IF NOT EXISTS arrival_event_id text;
ALTER TABLE public.song_link_events DROP CONSTRAINT IF EXISTS song_link_choice_arrival_check;
ALTER TABLE public.song_link_events ADD CONSTRAINT song_link_choice_arrival_check
  CHECK (arrival_event_id IS NULL OR (event IN ('choice','app_open') AND destination IS NOT NULL
  AND arrival_event_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'));
CREATE UNIQUE INDEX IF NOT EXISTS song_link_choice_arrival_destination_uidx
  ON public.song_link_events(link_id, arrival_event_id, destination)
  WHERE event='choice' AND arrival_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS song_link_app_open_arrival_uidx
  ON public.song_link_events(arrival_event_id)
  WHERE event='app_open' AND arrival_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.song_link_delivery_slots (
  arrival_event_id text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('meta','tiktok')),
  event_name text NOT NULL CHECK (event_name IN ('ListenClick','CompleteRegistration')),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','delivered','failed','unknown')),
  reserved_by uuid,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  PRIMARY KEY (arrival_event_id, provider, event_name),
  CHECK (arrival_event_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
ALTER TABLE public.song_link_delivery_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.song_link_delivery_slots FROM anon, authenticated;
GRANT ALL ON public.song_link_delivery_slots TO service_role;

CREATE INDEX IF NOT EXISTS song_link_arrival_fbclid_idx
  ON public.song_link_events(link_id, fbclid, created_at)
  WHERE event='arrival' AND fbclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS song_link_arrival_ttclid_idx
  ON public.song_link_events(link_id, ttclid, created_at)
  WHERE event='arrival' AND ttclid IS NOT NULL;