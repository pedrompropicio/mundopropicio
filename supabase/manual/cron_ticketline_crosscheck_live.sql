-- Cron ticketline-crosscheck-daily (jobid 1640) — criado 30/09/2026 (D-ERP152). Sem dry-run.
SELECT cron.unschedule('ticketline-crosscheck-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='ticketline-crosscheck-daily');
SELECT cron.schedule('ticketline-crosscheck-daily', '50 6 * * *', $cmd$
  SELECT net.http_post(
    url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/ticketline-crosscheck',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)),
    body := '{"triggeredBy":"pg_cron"}'::jsonb,
    timeout_milliseconds := 150000
  ) AS request_id;
$cmd$);
