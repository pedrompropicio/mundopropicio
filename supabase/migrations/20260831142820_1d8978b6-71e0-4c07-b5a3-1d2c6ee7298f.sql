ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS installment_group_id uuid NULL,
  ADD COLUMN IF NOT EXISTS installment_number integer NULL,
  ADD COLUMN IF NOT EXISTS installment_total integer NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_installment_group_id
  ON public.transactions (installment_group_id)
  WHERE installment_group_id IS NOT NULL;

COMMENT ON COLUMN public.transactions.installment_group_id IS
  'Identificador estrutural do parcelamento: todas as parcelas do mesmo documento partilham este uuid. A descrição (sufixo "(n/N)") NUNCA deve ser usada para identificar parcelamento — é apenas cosmética.';
COMMENT ON COLUMN public.transactions.installment_number IS
  'Ordem da parcela dentro do installment_group_id (1..N), pela ordem de vencimento. Identificação estrutural; a descrição nunca é lida para este efeito.';
COMMENT ON COLUMN public.transactions.installment_total IS
  'Número total de parcelas do installment_group_id. Identificação estrutural; a descrição nunca é lida para este efeito.';