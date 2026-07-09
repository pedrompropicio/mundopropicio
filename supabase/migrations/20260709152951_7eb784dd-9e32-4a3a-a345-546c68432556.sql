ALTER TABLE public.payment_list_items
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by text,
  ADD COLUMN IF NOT EXISTS removed_reason text;