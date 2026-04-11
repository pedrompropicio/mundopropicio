-- Add last_sales_date to events table
ALTER TABLE public.events
ADD COLUMN last_sales_date date DEFAULT NULL;