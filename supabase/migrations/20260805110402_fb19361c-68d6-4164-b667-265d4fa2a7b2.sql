ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_iva_rate_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_iva_rate_check
  CHECK (iva_rate = ANY (ARRAY[23, 13, 6, 0, 21, 10, 4]));

ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_iva_rate_check;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_iva_rate_check
  CHECK (iva_rate = ANY (ARRAY[23, 13, 6, 0, 21, 10, 4]));