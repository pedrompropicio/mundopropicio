UPDATE public.event_ticket_zones z
SET total_capacity = CASE
    WHEN z.name ILIKE 'Tenda VIP%Sábado%' OR z.name ILIKE 'Tenda VIP%Sabado%' THEN 519
    WHEN z.name ILIKE 'Tenda VIP%Domingo%' THEN 83
  END,
  updated_at = now()
FROM public.events e
WHERE z.event_id = e.id
  AND e.name ILIKE 'Coala Festival Portugal 2026'
  AND (z.name ILIKE 'Tenda VIP%Sábado%' OR z.name ILIKE 'Tenda VIP%Sabado%' OR z.name ILIKE 'Tenda VIP%Domingo%');