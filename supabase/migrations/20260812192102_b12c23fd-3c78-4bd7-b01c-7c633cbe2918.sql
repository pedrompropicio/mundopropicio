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
    body := '{"triggeredBy":"pg_cron"}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);