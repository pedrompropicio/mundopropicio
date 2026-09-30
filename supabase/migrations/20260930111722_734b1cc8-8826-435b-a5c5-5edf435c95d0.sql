ALTER TABLE public.account_categories
  ADD COLUMN IF NOT EXISTS ebitda_class text NULL;
ALTER TABLE public.account_categories
  DROP CONSTRAINT IF EXISTS account_categories_ebitda_class_check;
ALTER TABLE public.account_categories
  ADD CONSTRAINT account_categories_ebitda_class_check
  CHECK (ebitda_class IS NULL OR ebitda_class IN ('financeiro','imposto_rendimento','amortizacao'));
COMMENT ON COLUMN public.account_categories.ebitda_class IS 'D-ERP151: classe para vista EBITDA. NULL = operacional. Lida na conta de lançamento (último nível), não herda.';
UPDATE public.account_categories SET ebitda_class = 'imposto_rendimento' WHERE code = '10.5.03' AND ebitda_class IS NULL;
UPDATE public.account_categories SET ebitda_class = 'financeiro' WHERE code IN ('10.6.02','10.6.03','10.6.04','10.6.05') AND ebitda_class IS NULL;