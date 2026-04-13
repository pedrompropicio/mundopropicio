
-- Add withholding fields to cache configs
ALTER TABLE public.event_cache_configs
ADD COLUMN withholding_applicable boolean NOT NULL DEFAULT false,
ADD COLUMN withholding_rate numeric NOT NULL DEFAULT 25;

-- Create cache payments table for split payments
CREATE TABLE public.event_cache_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_config_id uuid NOT NULL REFERENCES public.event_cache_configs(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.account_categories(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  notes text,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  withholding_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.event_cache_payments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Cache payments viewable by authenticated"
ON public.event_cache_payments FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Cache payments insertable by admin or manager"
ON public.event_cache_payments FOR INSERT
TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY "Cache payments updatable by admin or manager"
ON public.event_cache_payments FOR UPDATE
TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY "Cache payments deletable by admin or manager"
ON public.event_cache_payments FOR DELETE
TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)
);

-- Updated_at trigger
CREATE TRIGGER update_cache_payments_updated_at
BEFORE UPDATE ON public.event_cache_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
