ALTER TABLE public.fever_sync_config
  ADD COLUMN IF NOT EXISTS b2b_token_secret_name text,
  ADD COLUMN IF NOT EXISTS partner_id            int  NOT NULL DEFAULT 49418,
  ADD COLUMN IF NOT EXISTS dashboard_id          int  NOT NULL DEFAULT 3697,
  ADD COLUMN IF NOT EXISTS card_sales_dashcard   int  NOT NULL DEFAULT 5927,
  ADD COLUMN IF NOT EXISTS card_sales_card       int  NOT NULL DEFAULT 786,
  ADD COLUMN IF NOT EXISTS card_tickets_dashcard int  NOT NULL DEFAULT 5928,
  ADD COLUMN IF NOT EXISTS card_tickets_card     int  NOT NULL DEFAULT 1693;

UPDATE public.fever_sync_config
SET b2b_token_secret_name = 'fever_b2b_token_coala_2026'
WHERE id = '53c82e46-8164-4dc2-a5da-e071a6ecad93';