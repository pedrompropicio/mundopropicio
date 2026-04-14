ALTER TABLE public.ticket_sales ADD COLUMN import_batch_id uuid DEFAULT NULL;
CREATE INDEX idx_ticket_sales_import_batch ON public.ticket_sales (import_batch_id) WHERE import_batch_id IS NOT NULL;