ALTER TABLE public.event_forecasts
  ADD COLUMN IF NOT EXISTS ordering_partner_id uuid REFERENCES public.event_partners(id) ON DELETE SET NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS ordering_partner_id uuid REFERENCES public.event_partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_forecasts_ordering_partner
  ON public.event_forecasts (ordering_partner_id) WHERE ordering_partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_ordering_partner
  ON public.transactions (ordering_partner_id) WHERE ordering_partner_id IS NOT NULL;

COMMENT ON COLUMN public.event_forecasts.ordering_partner_id IS 'Sócio ordenador da despesa (event_partners.id). NULL = MP/comum. Só aplicável a linhas de despesa.';
COMMENT ON COLUMN public.transactions.ordering_partner_id IS 'Sócio ordenador da despesa (event_partners.id). NULL = MP/comum ou herda da linha BP vinculada.';