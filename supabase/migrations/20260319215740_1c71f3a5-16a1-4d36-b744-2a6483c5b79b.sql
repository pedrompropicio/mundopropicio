ALTER TABLE public.event_forecasts 
ADD COLUMN formula_type text NOT NULL DEFAULT 'fixed',
ADD COLUMN formula_value numeric NOT NULL DEFAULT 0;