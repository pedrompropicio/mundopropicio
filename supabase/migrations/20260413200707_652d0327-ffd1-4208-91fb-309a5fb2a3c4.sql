
CREATE TABLE public.event_cache_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_config_id UUID NOT NULL REFERENCES public.event_cache_configs(id) ON DELETE CASCADE,
  occupancy_threshold NUMERIC NOT NULL DEFAULT 0,
  percentage NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.event_cache_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage cache tiers"
ON public.event_cache_tiers
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
