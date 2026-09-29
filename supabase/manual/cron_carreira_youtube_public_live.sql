-- Cron `carreira-youtube-public-diario` (jobid 1621) — criado em 29/09/2026.
-- Chama artist-song-youtube-public-sync para o Litto às 07:00 UTC (D-ERP150).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'carreira-youtube-public-diario') THEN
    PERFORM cron.unschedule('carreira-youtube-public-diario');
  END IF;
END $$;
SELECT cron.schedule('carreira-youtube-public-diario', '0 7 * * *', $cmd$
  SELECT net.http_post(
    url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/artist-song-youtube-public-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)),
    body := '{"artist_id":"b1a53be0-e8a8-45c0-bc32-5eea23f477ed","dry_run":false}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
$cmd$);
