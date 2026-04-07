
DELETE FROM public.event_ticket_lots
WHERE zone_id IN (
  SELECT id FROM public.event_ticket_zones
  WHERE event_id = '7d1dccec-c3e4-4ac6-81b8-5deb993046c7' AND session_id IS NULL
);

DELETE FROM public.event_ticket_zones
WHERE event_id = '7d1dccec-c3e4-4ac6-81b8-5deb993046c7' AND session_id IS NULL;
