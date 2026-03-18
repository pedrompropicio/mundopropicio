
-- Table for cachê configurations per event/artist
CREATE TABLE public.event_cache_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  artist_name TEXT NOT NULL,
  cache_type TEXT NOT NULL DEFAULT 'fixed', -- 'fixed' or 'variable'
  fixed_amount NUMERIC NOT NULL DEFAULT 0,
  percentage NUMERIC NOT NULL DEFAULT 0, -- percentage for variable cachê
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table for deduction categories (expenses subtracted from revenue before calculating variable cachê)
CREATE TABLE public.event_cache_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_config_id UUID NOT NULL REFERENCES public.event_cache_configs(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.account_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cache_config_id, category_id)
);

-- RLS for event_cache_configs
ALTER TABLE public.event_cache_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cache configs viewable by authenticated"
  ON public.event_cache_configs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Cache configs manageable by authenticated"
  ON public.event_cache_configs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- RLS for event_cache_deductions
ALTER TABLE public.event_cache_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cache deductions viewable by authenticated"
  ON public.event_cache_deductions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Cache deductions manageable by authenticated"
  ON public.event_cache_deductions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
