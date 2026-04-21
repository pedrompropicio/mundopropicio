ALTER TABLE public.ticket_office_settlements
  ADD COLUMN IF NOT EXISTS venue_invoice_remainder_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS venue_invoice_remainder_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS venue_invoice_remainder_payment_id uuid;