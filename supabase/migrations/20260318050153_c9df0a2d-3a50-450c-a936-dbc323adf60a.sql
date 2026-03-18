
-- Cities table
CREATE TABLE public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  country text NOT NULL DEFAULT 'Portugal',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cities viewable by authenticated" ON public.cities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Cities manageable by authenticated" ON public.cities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Venues table linked to cities
CREATE TABLE public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text DEFAULT NULL,
  capacity integer DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(city_id, name)
);

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venues viewable by authenticated" ON public.venues FOR SELECT TO authenticated USING (true);
CREATE POLICY "Venues manageable by authenticated" ON public.venues FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add city_id and venue_id to events
ALTER TABLE public.events ADD COLUMN city_id uuid REFERENCES public.cities(id) DEFAULT NULL;
ALTER TABLE public.events ADD COLUMN venue_id uuid REFERENCES public.venues(id) DEFAULT NULL;
