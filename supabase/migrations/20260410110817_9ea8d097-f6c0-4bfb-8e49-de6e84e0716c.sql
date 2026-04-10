
-- Supplier credits table
CREATE TABLE public.supplier_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  origin_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  used_amount NUMERIC NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  document_ref TEXT,
  valid_until DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supplier credits viewable by authenticated"
  ON public.supplier_credits FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Supplier credits insertable by admin or manager"
  ON public.supplier_credits FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Supplier credits updatable by admin or manager"
  ON public.supplier_credits FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Supplier credits deletable by admin or manager"
  ON public.supplier_credits FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_supplier_credits_updated_at
  BEFORE UPDATE ON public.supplier_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Credit usage tracking table
CREATE TABLE public.supplier_credit_usages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  credit_id UUID NOT NULL REFERENCES public.supplier_credits(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  used_by TEXT NOT NULL DEFAULT 'system',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_credit_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Credit usages viewable by authenticated"
  ON public.supplier_credit_usages FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Credit usages insertable by admin or manager"
  ON public.supplier_credit_usages FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

CREATE POLICY "Credit usages deletable by admin or manager"
  ON public.supplier_credit_usages FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
