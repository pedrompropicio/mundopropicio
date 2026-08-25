ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS paying_partner_id uuid REFERENCES public.event_partners(id);

COMMENT ON COLUMN public.transactions.paying_partner_id IS
  'Socio que desembolsa. NULL = empresa configurada no evento.';

COMMENT ON COLUMN public.transactions.ordering_partner_id IS
  'Socio que gera a especificacao/definicao da despesa. NULL = igual ao pagador.';

CREATE INDEX IF NOT EXISTS idx_transactions_paying_partner
  ON public.transactions(paying_partner_id);