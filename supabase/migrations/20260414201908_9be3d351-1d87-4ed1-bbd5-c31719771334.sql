ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'transfer',
  ADD COLUMN IF NOT EXISTS payment_entity text,
  ADD COLUMN IF NOT EXISTS payment_reference text;