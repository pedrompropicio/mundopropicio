-- D-ERP182 (2026-10-06): job 98 'carreira-soundcharts-sync-referencias-semanal' (30 9 * * 0)
-- substituído por 'carreira-soundcharts-sync-referencias-diario' (30 9 * * *), jobid 1875.
SELECT cron.unschedule('carreira-soundcharts-sync-referencias-semanal');
SELECT cron.schedule('carreira-soundcharts-sync-referencias-diario', '30 9 * * *', $c$
  SELECT net.http_post(
    url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/soundcharts-sync',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)),
    body := '{"dry_run":false,"roster_type":"referencia"}'::jsonb,
    timeout_milliseconds := 300000) AS request_id;
$c$);
