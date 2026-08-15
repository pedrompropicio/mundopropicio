select net.http_post(
  url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/fetch-ticketline-reports',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||public.get_vault_secret('email_queue_service_role_key')),
  body := jsonb_build_object('action','text','configId','12e8fa47-d4f7-4d89-92ff-f41ac6133c84','rawFrom',3600,'rawLen',5200,'urls', jsonb_build_array(
    'https://manager.ticketline.pt/managers/events/68027/sale_summary?utf8=%E2%9C%93&bulk_event_ids=&filter_start_date=01-01-2026&filter_end_date=15-08-2026&granularity=2'
  )),
  timeout_milliseconds := 90000);