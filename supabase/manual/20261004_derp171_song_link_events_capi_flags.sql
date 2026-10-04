-- D-ERP171 — JÁ APLICADO EM LIVE A 04/10 PELO CHAT 2 (autorização do Pedro). Registo idempotente.
ALTER TABLE public.song_link_events
  ADD COLUMN IF NOT EXISTS capi_fbc boolean,
  ADD COLUMN IF NOT EXISTS capi_fbp boolean,
  ADD COLUMN IF NOT EXISTS capi_external_id boolean;
