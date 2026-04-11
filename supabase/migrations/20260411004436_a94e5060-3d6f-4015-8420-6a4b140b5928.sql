
CREATE OR REPLACE FUNCTION public.validate_paid_requires_payment_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND NEW.payment_date IS NULL THEN
    RAISE EXCEPTION 'Transações pagas devem ter uma data de pagamento (payment_date)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_paid_payment_date
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.validate_paid_requires_payment_date();
