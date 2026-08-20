ALTER TABLE public.accountant_transaction_reviews
  DROP CONSTRAINT IF EXISTS accountant_transaction_reviews_status_check;

ALTER TABLE public.accountant_transaction_reviews
  ADD CONSTRAINT accountant_transaction_reviews_status_check
  CHECK (status = ANY (ARRAY['conferido'::text, 'pendente'::text, 'encerrada'::text]));

ALTER TABLE public.accountant_transaction_reviews
  ADD COLUMN IF NOT EXISTS closed_by uuid,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;