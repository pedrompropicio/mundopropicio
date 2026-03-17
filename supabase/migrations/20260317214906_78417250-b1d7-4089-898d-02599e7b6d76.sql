-- Ticket zones for an event (e.g., VIP, Plateia, Geral)
CREATE TABLE public.event_ticket_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  total_capacity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Price lots per zone (by quantity thresholds)
CREATE TABLE public.event_ticket_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES public.event_ticket_zones(id) ON DELETE CASCADE,
  lot_number INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL DEFAULT 'Lote',
  quantity INTEGER NOT NULL DEFAULT 0,
  price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.event_ticket_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_ticket_lots ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Ticket zones viewable by authenticated" ON public.event_ticket_zones
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Ticket zones manageable by authenticated" ON public.event_ticket_zones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Ticket lots viewable by authenticated" ON public.event_ticket_lots
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Ticket lots manageable by authenticated" ON public.event_ticket_lots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);