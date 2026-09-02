CREATE OR REPLACE FUNCTION public.enforce_transaction_approval_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_transaction_approval_permission ON public.transactions;

CREATE TRIGGER enforce_transaction_approval_permission
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_transaction_approval_permission();