
-- Create financial accounts table
CREATE TABLE public.financial_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'bank', -- bank, credit_card, debit_card, cash, other
  description TEXT,
  initial_balance NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  balance_visible_to_all BOOLEAN NOT NULL DEFAULT false, -- if false, only admin can see balance
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can view accounts (but balance visibility is controlled in app)
CREATE POLICY "Financial accounts viewable by authenticated"
  ON public.financial_accounts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Financial accounts manageable by admin"
  ON public.financial_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add account_id to transactions table (nullable for backward compatibility)
ALTER TABLE public.transactions ADD COLUMN account_id UUID REFERENCES public.financial_accounts(id);
