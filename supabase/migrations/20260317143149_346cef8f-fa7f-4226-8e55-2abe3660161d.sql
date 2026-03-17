
-- Payment lists (contas a pagar do dia)
CREATE TABLE public.payment_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected')),
  created_by text NOT NULL DEFAULT 'system',
  approved_by text,
  approved_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Items in a payment list
CREATE TABLE public.payment_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_list_id uuid NOT NULL REFERENCES public.payment_lists(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_list_items ENABLE ROW LEVEL SECURITY;

-- RLS for payment_lists
CREATE POLICY "Payment lists viewable by authenticated" ON public.payment_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Payment lists insertable by authenticated" ON public.payment_lists FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Payment lists updatable by authenticated" ON public.payment_lists FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Payment lists deletable by authenticated" ON public.payment_lists FOR DELETE TO authenticated USING (true);

-- RLS for payment_list_items
CREATE POLICY "Payment list items viewable by authenticated" ON public.payment_list_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Payment list items insertable by authenticated" ON public.payment_list_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Payment list items deletable by authenticated" ON public.payment_list_items FOR DELETE TO authenticated USING (true);

-- Triggers for updated_at
CREATE TRIGGER update_payment_lists_updated_at BEFORE UPDATE ON public.payment_lists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
