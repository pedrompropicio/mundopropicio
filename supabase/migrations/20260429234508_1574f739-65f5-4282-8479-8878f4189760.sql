DROP INDEX IF EXISTS public.suppliers_name_unique;

CREATE UNIQUE INDEX suppliers_company_name_unique
  ON public.suppliers (company_id, lower(trim(name)))
  WHERE is_active = true;