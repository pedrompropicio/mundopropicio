
CREATE TABLE public.venue_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  venue_id uuid REFERENCES public.venues(id) NOT NULL,
  city_id uuid REFERENCES public.cities(id),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue reservations viewable by authenticated"
  ON public.venue_reservations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Venue reservations manageable by authenticated"
  ON public.venue_reservations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Migrate existing reservations from events table
INSERT INTO public.venue_reservations (date, venue_id, city_id, notes)
SELECT e.date, e.venue_id, COALESCE(e.city_id, v.city_id), e.name
FROM public.events e
LEFT JOIN public.venues v ON v.id = e.venue_id
WHERE e.venue_id IS NOT NULL
  AND e.name LIKE 'Reserva%'
  AND e.event_type = 'simple';

-- Delete migrated reservations from events table
DELETE FROM public.events
WHERE venue_id IS NOT NULL
  AND name LIKE 'Reserva%'
  AND event_type = 'simple';
