CREATE OR REPLACE FUNCTION public.force_confidential_for_restricted_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.account_id IS NOT NULL AND NEW.is_confidential IS NOT TRUE THEN
    IF EXISTS (
      SELECT 1 FROM public.financial_accounts a
      WHERE a.id = NEW.account_id AND a.is_restricted = true
    ) THEN
      NEW.is_confidential := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_confidential_restricted_account ON public.transactions;
CREATE TRIGGER trg_force_confidential_restricted_account
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.force_confidential_for_restricted_account();