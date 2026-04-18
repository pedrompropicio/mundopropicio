-- Add withholds_revenue flag to financial accounts (for venues that retain ticket office revenue)
ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS withholds_revenue boolean NOT NULL DEFAULT false;

-- Create event_ticket_office_advances table
CREATE TABLE IF NOT EXISTS public.event_ticket_office_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  financial_account_id uuid NOT NULL,
  target_account_id uuid,
  transaction_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  advance_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  settlement_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_etoa_event ON public.event_ticket_office_advances(event_id);
CREATE INDEX IF NOT EXISTS idx_etoa_account ON public.event_ticket_office_advances(financial_account_id);
CREATE INDEX IF NOT EXISTS idx_etoa_settlement ON public.event_ticket_office_advances(settlement_id);
CREATE INDEX IF NOT EXISTS idx_etoa_transaction ON public.event_ticket_office_advances(transaction_id);

ALTER TABLE public.event_ticket_office_advances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advances viewable by authenticated"
  ON public.event_ticket_office_advances FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Advances insertable by admin or manager"
  ON public.event_ticket_office_advances FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Advances updatable by admin or manager"
  ON public.event_ticket_office_advances FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Advances deletable by admin or manager"
  ON public.event_ticket_office_advances FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_etoa_updated_at
  BEFORE UPDATE ON public.event_ticket_office_advances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();