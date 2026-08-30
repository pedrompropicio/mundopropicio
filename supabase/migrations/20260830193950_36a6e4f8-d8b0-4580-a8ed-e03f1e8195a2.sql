ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS is_accounting boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.financial_accounts.is_accounting IS 'false = conta gerencial; movimentos e documentos desta conta não entram nas exportações para a contabilidade';