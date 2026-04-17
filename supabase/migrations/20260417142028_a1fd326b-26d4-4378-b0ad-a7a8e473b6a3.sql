ALTER TABLE public.ticket_sales 
ADD COLUMN IF NOT EXISTS total_value numeric;

COMMENT ON COLUMN public.ticket_sales.total_value IS 'Valor exato da venda conforme ficheiro importado (preserva cêntimos perdidos no arredondamento de unit_price). Quando NULL, usar quantity * unit_price.';