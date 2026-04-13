ALTER TABLE public.event_cache_configs
ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL DEFAULT NULL;