select net.http_post(
  url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/fetch-ticketline-reports',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||public.get_vault_secret('email_queue_service_role_key')),
  body := jsonb_build_object('action','form','configId','12e8fa47-d4f7-4d89-92ff-f41ac6133c84','urls', jsonb_build_array(
    'https://manager.ticketline.pt/managers/dashboard/sale_summary',
    'https://manager.ticketline.pt/managers/events/68027/sale_summary'
  )),
  timeout_milliseconds := 120000);