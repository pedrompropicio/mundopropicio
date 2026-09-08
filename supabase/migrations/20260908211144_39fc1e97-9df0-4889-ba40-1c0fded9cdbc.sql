DROP INDEX IF EXISTS public.onebox_daily_sales_event_date_unique;

ALTER TABLE public.onebox_daily_sales
  ADD CONSTRAINT onebox_daily_sales_event_date_unique UNIQUE (event_id, sale_date);

ALTER TABLE public.onebox_daily_sales
  ADD CONSTRAINT onebox_daily_sales_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;