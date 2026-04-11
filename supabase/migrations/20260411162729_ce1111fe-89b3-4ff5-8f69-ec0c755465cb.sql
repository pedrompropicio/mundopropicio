ALTER TABLE public.event_cache_configs
ADD COLUMN cache_deduction_basis TEXT NOT NULL DEFAULT 'net';
