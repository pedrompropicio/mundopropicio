
-- 1. Create ticket_office_settlements table
CREATE TABLE public.ticket_office_settlements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  financial_account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  gross_revenue NUMERIC NOT NULL DEFAULT 0,
  total_deductions NUMERIC NOT NULL DEFAULT 0,
  net_calculated NUMERIC NOT NULL DEFAULT 0,
  net_adjusted NUMERIC,
  adjustment_notes TEXT,
  net_transferred NUMERIC NOT NULL DEFAULT 0,
  transfer_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  transfer_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  document_url TEXT,
  document_name TEXT,
  notes TEXT,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  reversed_at TIMESTAMPTZ,
  reversed_by UUID,
  reversal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL DEFAULT auth.uid(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settlements_status_check CHECK (status IN ('draft', 'confirmed', 'reversed'))
);

-- Index for fast lookup by office and event
CREATE INDEX idx_settlements_office ON public.ticket_office_settlements(financial_account_id);
CREATE INDEX idx_settlements_event ON public.ticket_office_settlements(event_id);
CREATE INDEX idx_settlements_status ON public.ticket_office_settlements(status);

-- 2. Add settlement_id to transactions
ALTER TABLE public.transactions
  ADD COLUMN settlement_id UUID REFERENCES public.ticket_office_settlements(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_settlement ON public.transactions(settlement_id);

-- 3. updated_at trigger
CREATE TRIGGER trg_settlements_updated_at
  BEFORE UPDATE ON public.ticket_office_settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Enable RLS
ALTER TABLE public.ticket_office_settlements ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies
CREATE POLICY "Authenticated users can view settlements"
ON public.ticket_office_settlements
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Managers can create settlements"
ON public.ticket_office_settlements
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_permission(auth.uid(), 'manage_accounts')
);

CREATE POLICY "Managers can update draft, admins can update any"
ON public.ticket_office_settlements
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (
    public.has_permission(auth.uid(), 'manage_accounts')
    AND status = 'draft'
  )
);

CREATE POLICY "Admins can delete settlements"
ON public.ticket_office_settlements
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 6. Storage bucket for settlement attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-office-settlements', 'ticket-office-settlements', false)
ON CONFLICT (id) DO NOTHING;

-- 7. Storage RLS policies
CREATE POLICY "Authenticated can read settlement files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'ticket-office-settlements');

CREATE POLICY "Managers can upload settlement files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ticket-office-settlements'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_permission(auth.uid(), 'manage_accounts')
  )
);

CREATE POLICY "Managers can update settlement files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'ticket-office-settlements'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_permission(auth.uid(), 'manage_accounts')
  )
);

CREATE POLICY "Admins can delete settlement files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'ticket-office-settlements'
  AND public.has_role(auth.uid(), 'admin')
);
