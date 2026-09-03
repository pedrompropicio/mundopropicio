ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ticketing_baseline_net numeric,
  ADD COLUMN IF NOT EXISTS ticketing_baseline_at timestamptz,
  ADD COLUMN IF NOT EXISTS ab_baseline_net numeric,
  ADD COLUMN IF NOT EXISTS ab_baseline_at timestamptz;

COMMENT ON COLUMN public.events.ticketing_baseline_net IS 'DR-2026-09-03-D21: previsto original (s/IVA) da bilheteira = carga inicial x preco de planeamento, fixado na primeira vez que a UI o calcula.';
COMMENT ON COLUMN public.events.ab_baseline_net IS 'DR-2026-09-03-D21: previsto original (s/IVA) do modulo A&B, fixado na primeira vez que a UI o calcula.';