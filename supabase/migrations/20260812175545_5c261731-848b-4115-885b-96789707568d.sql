-- 1) lots_locked em event_marketing
ALTER TABLE public.event_marketing
  ADD COLUMN IF NOT EXISTS lots_locked boolean NOT NULL DEFAULT false;

-- 2) log de varreduras
CREATE TABLE IF NOT EXISTS public.bilheteira_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  run_at timestamptz NOT NULL DEFAULT now(),
  provider text,
  url text,
  parse_ok boolean,
  raw_summary jsonb,
  changes jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bilheteira_sync_log TO authenticated;
GRANT ALL ON public.bilheteira_sync_log TO service_role;

ALTER TABLE public.bilheteira_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bilheteira_sync_log_select_admin"
  ON public.bilheteira_sync_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE INDEX IF NOT EXISTS idx_bilheteira_sync_log_event_run
  ON public.bilheteira_sync_log (event_id, run_at DESC);

-- 3) cron diário 08:00 UTC = 09:00 Europe/Lisbon (horário de verão)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('bilheteira-sync-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bilheteira-sync-daily');

SELECT cron.schedule(
  'bilheteira-sync-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ukpuhoynrqobqtzdbysp.supabase.co/functions/v1/bilheteira-sync',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"triggeredBy":"pg_cron"}'::jsonb
  ) AS request_id;
  $$
);