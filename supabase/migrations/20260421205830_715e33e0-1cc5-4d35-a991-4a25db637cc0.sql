ALTER TABLE public.ticket_office_settlements
  ADD COLUMN IF NOT EXISTS venue_retained_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS venue_retained_invoice_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS venue_retained_payment_id UUID REFERENCES public.transaction_payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS venue_retained_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_settlements_venue_invoice
  ON public.ticket_office_settlements(venue_retained_invoice_id)
  WHERE venue_retained_invoice_id IS NOT NULL;