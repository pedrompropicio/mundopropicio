ALTER TABLE public.coala_sync_row_state
  ADD COLUMN IF NOT EXISTS identity_key text,
  ADD COLUMN IF NOT EXISTS fallback_key text,
  ADD COLUMN IF NOT EXISTS legacy_key text,
  ADD COLUMN IF NOT EXISTS row_number integer,
  ADD COLUMN IF NOT EXISTS supplier_norm text,
  ADD COLUMN IF NOT EXISTS invoice_ref_norm text,
  ADD COLUMN IF NOT EXISTS center_custo_norm text,
  ADD COLUMN IF NOT EXISTS net_amount_cents bigint,
  ADD COLUMN IF NOT EXISTS last_apply_hash text,
  ADD COLUMN IF NOT EXISTS needs_manual_link boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bootstrap_source text;

CREATE INDEX IF NOT EXISTS idx_coala_row_state_config_identity
  ON public.coala_sync_row_state (config_id, identity_key)
  WHERE identity_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coala_row_state_config_fallback
  ON public.coala_sync_row_state (config_id, fallback_key)
  WHERE fallback_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coala_row_state_config_supplier_amount
  ON public.coala_sync_row_state (config_id, supplier_norm, net_amount_cents);

CREATE INDEX IF NOT EXISTS idx_coala_row_state_forecast
  ON public.coala_sync_row_state (forecast_id)
  WHERE forecast_id IS NOT NULL;