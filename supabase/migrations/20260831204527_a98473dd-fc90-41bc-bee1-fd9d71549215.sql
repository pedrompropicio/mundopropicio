ALTER TABLE public.event_partners ALTER COLUMN expense_includes_iva DROP DEFAULT;
ALTER TABLE public.event_partners ALTER COLUMN expense_includes_iva DROP NOT NULL;

UPDATE public.event_partners SET expense_includes_iva = NULL WHERE expense_includes_iva = false;

COMMENT ON COLUMN public.event_partners.expense_includes_iva IS
  'Base de apuramento da DESPESA para este sócio. NULL = herda a base contratual do evento (events.partner_calc_basis). true = apura sempre com IVA (sócio que não recupera IVA, ex. sede BR). false = apura sempre sem IVA (base liquida, sócio que recupera). Nunca confundir com o seletor de vista c/IVA-s/IVA, que nao entra no apuramento (D-ERP4).';