CREATE OR REPLACE FUNCTION public.force_transitory_for_capital_branch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
BEGIN
  IF NEW.category_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id)
  THEN
    SELECT code INTO v_code
    FROM public.account_categories
    WHERE id = NEW.category_id;

    -- Ramo Capital (10.1.*) → movimento de capital: entra na tesouraria, fora do resultado.
    -- Nunca força para false noutras rubricas.
    IF v_code IS NOT NULL AND v_code LIKE '10.1.%' THEN
      NEW.is_transitory := true;
      -- D-ERP80 (adenda 22/09/2026): o motivo do ramo 10.1 é DERIVADO da rubrica
      -- e sobrepõe-se sempre ao que vier do ecrã (havia aportes gravados como
      -- 'entrada_a_repassar' porque o modal do banco mandava o seu próprio motivo).
      NEW.transitory_reason := CASE
        WHEN v_code = '10.1.04' THEN 'emprestimo_socio'
        ELSE 'aporte_socio'
      END;
    END IF;
  END IF;

  -- Deixou de ser transitória: o motivo cai com ela.
  IF coalesce(NEW.is_transitory, false) = false THEN
    NEW.transitory_reason := NULL;
  END IF;

  RETURN NEW;
END;
$function$;