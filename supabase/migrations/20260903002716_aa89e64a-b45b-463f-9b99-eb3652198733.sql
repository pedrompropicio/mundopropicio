CREATE OR REPLACE FUNCTION public.enforce_transaction_approval_permission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_should_check boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_should_check := (NEW.status = 'approved');
  ELSIF TG_OP = 'UPDATE' THEN
    v_should_check := (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved');
  END IF;

  IF v_should_check THEN
    -- service_role / crons / edge functions / syncs: sem identidade de utilizador → permitido
    IF v_uid IS NULL THEN
      RETURN NEW;
    END IF;

    IF NOT (
      public.is_platform_admin()
      OR public.has_permission_in(v_uid, 'approve_transactions', NEW.company_id)
    ) THEN
      RAISE EXCEPTION 'Sem permissão para aprovar transações nesta empresa.'
        USING ERRCODE = '42501';
    END IF;

    -- D1 + D8: evento gerido COM BP exige linha de BP no momento da aprovação.
    -- Isenção: filha de rateio ou parcela — a obrigação é do pai (o master de
    -- rateio não tem event_id, logo nunca seria abrangido).
    IF NEW.type = 'expense'
       AND NEW.event_id IS NOT NULL
       AND NEW.forecast_id IS NULL
       AND NEW.parent_transaction_id IS NULL
       AND public.event_budget_mode(NEW.event_id) = 'with_bp'
    THEN
      RAISE EXCEPTION 'Esta transação não tem linha de BP. Escolhe a linha (ou cria uma) antes de aprovar.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;