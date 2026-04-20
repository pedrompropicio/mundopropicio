-- Hard link entre linhas da mesma fatura com múltiplas taxas de IVA
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS invoice_group_id uuid;

ALTER TABLE public.event_forecasts
  ADD COLUMN IF NOT EXISTS invoice_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_transactions_invoice_group
  ON public.transactions(invoice_group_id)
  WHERE invoice_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_forecasts_invoice_group
  ON public.event_forecasts(invoice_group_id)
  WHERE invoice_group_id IS NOT NULL;

COMMENT ON COLUMN public.transactions.invoice_group_id IS
  'Agrupa linhas da mesma fatura com múltiplas taxas de IVA. Operações (eliminar, liquidar, aprovar, editar campos partilhados) propagam às irmãs.';

COMMENT ON COLUMN public.event_forecasts.invoice_group_id IS
  'Agrupa linhas de BP da mesma fatura com múltiplas taxas de IVA.';