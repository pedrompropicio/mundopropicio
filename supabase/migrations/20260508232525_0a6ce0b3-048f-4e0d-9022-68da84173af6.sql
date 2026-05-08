ALTER TABLE public.reimbursement_notes ADD COLUMN IF NOT EXISTS payment_iban TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS iban_override TEXT;