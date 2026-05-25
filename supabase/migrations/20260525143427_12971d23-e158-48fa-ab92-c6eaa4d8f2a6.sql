ALTER TABLE public.ticketline_sync_config
  ADD COLUMN IF NOT EXISTS sales_start_date date;

COMMENT ON COLUMN public.ticketline_sync_config.sales_start_date IS
  'Data de início de vendas (on-sale) na Ticketline. Usada como filter_start_date no pedido sale_summary. Nula = fallback 01-01-2025.';