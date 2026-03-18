
-- Move ALL remaining events to venue_reservations (they were imported as room bookings, not actual events)
-- Events with venue_id get moved directly
INSERT INTO public.venue_reservations (date, venue_id, city_id, notes)
SELECT e.date, e.venue_id, COALESCE(e.city_id, v.city_id), e.name
FROM public.events e
LEFT JOIN public.venues v ON v.id = e.venue_id
WHERE e.venue_id IS NOT NULL
  AND e.parent_event_id IS NULL;

-- For sub-events (children of parent events), also move them
INSERT INTO public.venue_reservations (date, venue_id, city_id, notes)
SELECT e.date, e.venue_id, COALESCE(e.city_id, v.city_id),
  COALESCE(p.name, '') || ' — ' || e.name
FROM public.events e
LEFT JOIN public.venues v ON v.id = e.venue_id
LEFT JOIN public.events p ON p.id = e.parent_event_id
WHERE e.venue_id IS NOT NULL
  AND e.parent_event_id IS NOT NULL;

-- Events without venue (like Deive Leonardo Algarve) - skip them or handle
-- For events without venue_id, we can't create a reservation (venue is required)
-- So we just delete them

-- Delete all sub-events first (foreign key)
DELETE FROM public.events WHERE parent_event_id IS NOT NULL;

-- Delete all remaining events
DELETE FROM public.events;
