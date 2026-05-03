
-- Combo passes: simplificar para 1 zona por passe (decisão 2026-05-03).
-- Live não tem combos criados — drop seguro da M:N.
ALTER TABLE public.event_combo_passes
  ADD COLUMN zone_id uuid REFERENCES public.event_ticket_zones(id) ON DELETE CASCADE;
CREATE INDEX idx_event_combo_passes_zone ON public.event_combo_passes(zone_id);

DROP TABLE IF EXISTS public.event_combo_pass_zones CASCADE;
