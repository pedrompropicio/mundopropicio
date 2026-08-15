select net.http_post(
  url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/fetch-ticketline-reports',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||public.get_vault_secret('email_queue_service_role_key')),
  body := jsonb_build_object('action','postfilter','configId','12e8fa47-d4f7-4d89-92ff-f41ac6133c84','startDD','01-08-2026','endDD','15-08-2026'),
  timeout_milliseconds := 250000);