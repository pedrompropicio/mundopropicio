
-- Add zone_id to ticket_sales so sales can be registered directly against a zone (without a lot)
ALTER TABLE public.ticket_sales 
  ADD COLUMN zone_id uuid REFERENCES public.event_ticket_zones(id) ON DELETE CASCADE;

-- Make lot_id nullable so sales can exist without a lot
ALTER TABLE public.ticket_sales 
  ALTER COLUMN lot_id DROP NOT NULL;

-- Add a check: at least one of lot_id or zone_id must be set
ALTER TABLE public.ticket_sales 
  ADD CONSTRAINT ticket_sales_lot_or_zone CHECK (lot_id IS NOT NULL OR zone_id IS NOT NULL);
