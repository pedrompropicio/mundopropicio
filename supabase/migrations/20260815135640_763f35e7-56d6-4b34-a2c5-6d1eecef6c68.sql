select net.http_post(
  url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/fetch-ticketline-reports',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||public.get_vault_secret('email_queue_service_role_key')),
  body := jsonb_build_object('action','matrix','configId','12e8fa47-d4f7-4d89-92ff-f41ac6133c84','urls', jsonb_build_array(
    'https://manager.ticketline.pt/managers/dashboard/sale_summary.xlsx?granularity=2&bulk_event_ids=68027&filter_start_date=2026-01-01&filter_end_date=2026-08-15',
    'https://manager.ticketline.pt/managers/dashboard/sale_summary.xlsx?granularity=2&bulk_event_ids%5B%5D=68027&filter_start_date=01-01-2026&filter_end_date=15-08-2026',
    'https://manager.ticketline.pt/managers/dashboard/sale_summary.xlsx?granularity=2&bulk_event_ids=68027&filter_start_date=2026-01-01%2000%3A00&filter_end_date=2026-08-15%2023%3A59'
  )),
  timeout_milliseconds := 170000);