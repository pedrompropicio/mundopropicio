
CREATE TABLE public.recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  iva_rate INTEGER NOT NULL DEFAULT 23,
  category_id UUID REFERENCES public.account_categories(id),
  event_id UUID REFERENCES public.events(id),
  supplier_id UUID REFERENCES public.suppliers(id),
  account_id UUID REFERENCES public.financial_accounts(id),
  specification TEXT,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  day_of_month INTEGER NOT NULL DEFAULT 1,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_generated_at DATE,
  next_due_date DATE,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recurring transactions viewable by authenticated"
  ON public.recurring_transactions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Recurring transactions manageable by authenticated"
  ON public.recurring_transactions FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_recurring_transactions_updated_at
  BEFORE UPDATE ON public.recurring_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
