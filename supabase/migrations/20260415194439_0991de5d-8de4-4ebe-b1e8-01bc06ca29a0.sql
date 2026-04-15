
-- Create individual payments tracking table
CREATE TABLE public.transaction_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_date DATE NOT NULL,
  account_id UUID REFERENCES public.financial_accounts(id),
  payment_method TEXT NOT NULL DEFAULT 'transfer',
  payment_entity TEXT,
  payment_reference TEXT,
  invoice_ref TEXT,
  withholding_amount NUMERIC NOT NULL DEFAULT 0,
  credit_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT NOT NULL DEFAULT 'sistema',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transaction_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Transaction payments viewable by authenticated"
  ON public.transaction_payments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Transaction payments insertable by privileged roles"
  ON public.transaction_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );

CREATE POLICY "Transaction payments updatable by admin or manager"
  ON public.transaction_payments FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Transaction payments deletable by admin or manager"
  ON public.transaction_payments FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

-- Trigger for updated_at
CREATE TRIGGER update_transaction_payments_updated_at
  BEFORE UPDATE ON public.transaction_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_transaction_payments_transaction_id ON public.transaction_payments(transaction_id);
