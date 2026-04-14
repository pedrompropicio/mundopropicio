
ALTER TABLE public.transactions 
  ADD COLUMN IF NOT EXISTS split_mode text DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS split_amount numeric;
