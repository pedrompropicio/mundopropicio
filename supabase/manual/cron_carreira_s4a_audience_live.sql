-- D-ERP172 — cron diário da audiência S4A (aplicado em Live a 05/10/2026; crons não propagam com Publish).
SELECT cron.schedule('carreira-s4a-audience-diario', '45 8 * * *', $$
  SELECT net.http_post(
    url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/s4a-audience-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)),
    body := '{"dry_run":false}'::jsonb,
    timeout_milliseconds := 180000);
$$);
