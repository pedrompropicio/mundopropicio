ALTER TABLE public.companies
  ADD COLUMN default_budget_mode text NOT NULL DEFAULT 'with_bp';

ALTER TABLE public.companies
  ADD CONSTRAINT companies_default_budget_mode_check
  CHECK (default_budget_mode IN ('with_bp','without_bp'));

COMMENT ON COLUMN public.companies.default_budget_mode IS 'Modo de gestão orçamental por defeito dos eventos desta empresa (D6).';

ALTER TABLE public.events
  ADD COLUMN budget_mode text NULL;

ALTER TABLE public.events
  ADD CONSTRAINT events_budget_mode_check
  CHECK (budget_mode IS NULL OR budget_mode IN ('with_bp','without_bp'));

COMMENT ON COLUMN public.events.budget_mode IS 'Override do modo orçamental deste evento. NULL herda companies.default_budget_mode. Nada a ver com operacao_mode (fases do Hub de Produção).';

UPDATE public.companies SET default_budget_mode = 'without_bp'
WHERE id IN ('34b3c3d1-e695-42ab-849f-a2994b78fc9d','f0f21410-0f92-4527-9c7f-b766d255093e');

CREATE OR REPLACE FUNCTION public.event_budget_mode(_event_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(e.budget_mode, c.default_budget_mode, 'with_bp')
  FROM public.events e
  JOIN public.companies c ON c.id = e.company_id
  WHERE e.id = _event_id
$$;