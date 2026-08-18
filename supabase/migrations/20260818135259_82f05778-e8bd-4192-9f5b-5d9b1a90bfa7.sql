ALTER TABLE public.event_ticket_zones ADD COLUMN IF NOT EXISTS sync_generated boolean NOT NULL DEFAULT false;
ALTER TABLE public.event_ticket_lots ADD COLUMN IF NOT EXISTS sync_generated boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.event_ticket_zones.sync_generated IS 'true = âncora técnica criada por sync de bilheteira; nunca aparece no planeamento (previsão) do ERP';
COMMENT ON COLUMN public.event_ticket_lots.sync_generated IS 'true = âncora técnica criada por sync de bilheteira; nunca aparece no planeamento (previsão) do ERP';
-- Marcar retroativamente as âncoras já existentes (quantity=0, price=0, sem tipo de bilhete)
UPDATE public.event_ticket_lots SET sync_generated = true
WHERE quantity = 0 AND price = 0 AND ticket_type_id IS NULL;
UPDATE public.event_ticket_zones z SET sync_generated = true
WHERE z.total_capacity = 0
  AND NOT EXISTS (SELECT 1 FROM public.event_ticket_lots l WHERE l.zone_id = z.id AND l.sync_generated = false);