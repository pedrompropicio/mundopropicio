ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS initial_balance_date date;

COMMENT ON COLUMN public.financial_accounts.initial_balance_date IS
  'Data de corte do saldo inicial: initial_balance e o saldo ao fecho deste dia. Movimentos com COALESCE(payment_date, date) <= esta data nao entram no saldo. NULL = sem corte.';