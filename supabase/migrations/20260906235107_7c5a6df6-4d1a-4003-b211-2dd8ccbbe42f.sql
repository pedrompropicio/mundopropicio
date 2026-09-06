ALTER TABLE public.ads_invoice
  ADD COLUMN IF NOT EXISTS confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS applied_by uuid,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS parent_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

ALTER TABLE public.ads_invoice_line
  ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ads_invoice.confirmed_by IS 'Utilizador que confirmou o rateio (status confirmed)';
COMMENT ON COLUMN public.ads_invoice.applied_by IS 'Utilizador que gerou os lançamentos (status applied)';
COMMENT ON COLUMN public.ads_invoice.parent_transaction_id IS 'Transacao-mae criada na geracao dos lancamentos (idempotencia)';
COMMENT ON COLUMN public.ads_invoice_line.transaction_id IS 'Transacao-filha do evento desta linha (idempotencia e rastreio)';

CREATE INDEX IF NOT EXISTS idx_ads_invoice_line_transaction ON public.ads_invoice_line(transaction_id);