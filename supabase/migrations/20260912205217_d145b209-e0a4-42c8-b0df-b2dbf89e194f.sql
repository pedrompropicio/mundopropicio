ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS consolidate_bank_movements_view boolean NOT NULL DEFAULT true;