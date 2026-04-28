-- Permitir declarar a retenção de IRS já no lançamento da transação
-- (a fatura traz a retenção desde a emissão; antes só era capturada na liquidação).
-- Mantemos o registo final em transaction_payments.withholding_amount (pode ser editado).
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS declared_withholding_rate numeric NULL,
  ADD COLUMN IF NOT EXISTS declared_withholding_amount numeric NULL;

COMMENT ON COLUMN public.transactions.declared_withholding_rate IS
  'Taxa de retenção IRS declarada na fatura no momento do lançamento (%). Opcional. Pré-preenche o modal de pagamento mas permanece editável na liquidação.';
COMMENT ON COLUMN public.transactions.declared_withholding_amount IS
  'Valor de retenção IRS declarado na fatura no momento do lançamento (€). Opcional. Pré-preenche o modal de pagamento mas permanece editável na liquidação.';

-- Validação leve: se algum dos dois for definido, tem de ser >= 0
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_declared_withholding_nonneg'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_declared_withholding_nonneg
      CHECK (
        (declared_withholding_rate IS NULL OR declared_withholding_rate >= 0)
        AND (declared_withholding_amount IS NULL OR declared_withholding_amount >= 0)
      );
  END IF;
END $$;