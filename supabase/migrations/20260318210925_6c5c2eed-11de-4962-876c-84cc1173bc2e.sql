ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_date date NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS invoice_ref text NULL;