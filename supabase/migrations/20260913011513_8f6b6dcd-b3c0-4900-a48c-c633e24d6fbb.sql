ALTER TABLE public.events
  ADD COLUMN cost_expense_source text NOT NULL DEFAULT 'committed'
    CHECK (cost_expense_source IN ('realized','committed')),
  ADD COLUMN cost_include_overhead boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.events.cost_expense_source IS
  'Critério de custo do evento (D25 e2): realized = transações; committed = previsto + excedido. Único para card, Fecho, Encontro de Contas, Apuramentos, PDFs e Portal.';
COMMENT ON COLUMN public.events.cost_include_overhead IS
  'Overhead entra no custo do evento (D25 e2). Default true.';