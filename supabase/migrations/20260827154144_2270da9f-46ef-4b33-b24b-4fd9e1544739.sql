CREATE OR REPLACE FUNCTION public.force_transitory_for_capital_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só reavalia quando a rubrica muda (ou na inserção), para não fazer lookup em todo o UPDATE.
  IF TG_OP = 'UPDATE'
     AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id THEN
    RETURN NEW;
  END IF;

  SELECT code INTO v_code
  FROM public.account_categories
  WHERE id = NEW.category_id;

  -- Ramo Capital (10.1.*) → movimento de capital: entra na tesouraria, fora do resultado.
  -- Nunca força para false noutras rubricas.
  IF v_code IS NOT NULL AND v_code LIKE '10.1.%' THEN
    NEW.is_transitory := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_transitory_capital ON public.transactions;

CREATE TRIGGER trg_force_transitory_capital
BEFORE INSERT OR UPDATE OF category_id ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.force_transitory_for_capital_branch();