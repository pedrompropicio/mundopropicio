ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_operation_key_check
  CHECK (operation_key IS NULL OR operation_key ~ '^[A-Z0-9]+(-[A-Z0-9]+)+$');

COMMENT ON CONSTRAINT transactions_operation_key_check ON public.transactions IS
  'D-ERP45: chave de operacao segue PREFIXO-... em maiusculas. Espelho de src/lib/operation-key.ts (OPERATION_KEY_PATTERN) e da validacao em update-transaction.';