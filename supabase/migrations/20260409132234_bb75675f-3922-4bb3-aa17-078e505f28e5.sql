ALTER TABLE public.event_ticket_lots
ADD COLUMN lot_type text NOT NULL DEFAULT 'regular';

ALTER TABLE public.event_ticket_lots
ADD CONSTRAINT event_ticket_lots_lot_type_check
CHECK (lot_type IN ('regular', 'promo', 'special'));