-- Settlement por cidade para configurações de cachê em eventos turnê
-- A configuração base (artista, %, tiers, mínimo, deduções, retenção) continua no Master.
-- O ajuste, o snapshot real e o estado de finalização passam a ser por cidade (sub-evento).
CREATE TABLE public.event_cache_city_settlements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_config_id UUID NOT NULL REFERENCES public.event_cache_configs(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  adjusted_amount NUMERIC,
  real_amount NUMERIC,
  is_finalized BOOLEAN NOT NULL DEFAULT false,
  finalized_at TIMESTAMP WITH TIME ZONE,
  finalized_by TEXT,
  agreement_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (cache_config_id, event_id)
);

CREATE INDEX idx_cache_city_settlements_event ON public.event_cache_city_settlements(event_id);
CREATE INDEX idx_cache_city_settlements_config ON public.event_cache_city_settlements(cache_config_id);

ALTER TABLE public.event_cache_city_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "City settlements viewable by authenticated"
ON public.event_cache_city_settlements FOR SELECT
TO authenticated USING (true);

CREATE POLICY "City settlements insertable by admin or manager"
ON public.event_cache_city_settlements FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "City settlements updatable by admin or manager"
ON public.event_cache_city_settlements FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "City settlements deletable by admin or manager"
ON public.event_cache_city_settlements FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_event_cache_city_settlements_updated_at
BEFORE UPDATE ON public.event_cache_city_settlements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();