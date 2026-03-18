
-- Create parent tour event (no venue/city)
INSERT INTO public.events (id, name, date, event_type, status, pl_mode)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Turnê Simone Mendes', '2026-10-02', 'multi_day', 'planning', 'passive');

-- Create sub-event Lisboa
INSERT INTO public.events (id, name, date, event_type, status, pl_mode, parent_event_id, venue_id, city_id)
VALUES ('a0000000-0000-0000-0000-000000000002', 'Lisboa', '2026-10-02', 'simple', 'planning', 'passive',
  'a0000000-0000-0000-0000-000000000001', 'fa696ce1-667a-49d1-9c4b-de0821d7155b', '671b9556-11dd-4937-aae4-3b3f3ef72ae8');

-- Create sub-event Porto
INSERT INTO public.events (id, name, date, event_type, status, pl_mode, parent_event_id, venue_id, city_id)
VALUES ('a0000000-0000-0000-0000-000000000003', 'Porto', '2026-10-03', 'simple', 'planning', 'passive',
  'a0000000-0000-0000-0000-000000000001', '95fcb553-c14c-4b97-a83a-bf93fc7c130f', '115c9894-5ff4-477b-8b08-850eeb2da675');

-- Remove the Simone Mendes entries from venue_reservations
DELETE FROM public.venue_reservations WHERE notes ILIKE '%simone%';
