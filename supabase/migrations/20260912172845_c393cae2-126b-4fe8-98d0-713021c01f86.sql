ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS operation_key text;

COMMENT ON COLUMN public.transactions.operation_key IS
  'Chave de operação: agrupa transações do mesmo fecho (ex.: ACERTO-FOOD-IVETE-2026, CAMARIM-<id>). Independente de payment_method e NUNCA limpa por mudança de método, estado ou liquidação. Distinta de payment_reference (referência MB/AT).';

CREATE INDEX IF NOT EXISTS idx_transactions_company_operation_key
  ON public.transactions (company_id, operation_key)
  WHERE operation_key IS NOT NULL;