
ALTER TABLE public.event_forecasts
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN approved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN approved_by TEXT,
  ADD COLUMN transaction_id UUID REFERENCES public.transactions(id);
