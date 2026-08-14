CREATE OR REPLACE FUNCTION public.enforce_tx_paid_requires_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND NEW.account_id IS NULL THEN
    -- Isenções documentadas:
    --  * fluxos server-side (edge functions / importações) correm como service_role
    --  * transitórias (caução, irmã "extra do sócio"), fora do resultado e reembolsos
    --    nascem legitimamente sem conta da empresa
    IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'supabase_storage_admin')
       OR COALESCE(NEW.is_transitory, false)
       OR COALESCE(NEW.exclude_from_result, false)
       OR COALESCE(NEW.is_reimbursement, false) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Transação paga exige conta financeira associada (account_id).';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tx_paid_requires_account ON public.transactions;
CREATE TRIGGER trg_enforce_tx_paid_requires_account
BEFORE INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.enforce_tx_paid_requires_account();