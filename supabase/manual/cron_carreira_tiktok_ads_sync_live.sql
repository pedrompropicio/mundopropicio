-- D-ERP178 — aplicado em Live a 06/10/2026 (jobid 1867); crons não propagam com Publish.
select cron.schedule('carreira-tiktok-ads-sync','20 7,13,19 * * *',$$
  select net.http_post(
    url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/artist-ads-tiktok-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key' limit 1)),
    body := '{"all":true,"days":3}'::jsonb,
    timeout_milliseconds := 180000);
$$);
