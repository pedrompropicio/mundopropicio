-- Um pagamento é um facto, não uma promessa: `payment_date` regista quando o
-- dinheiro saiu. Uma saída futura é uma PREVISÃO e vive em `due_date`.
-- DDL já aplicado em Live a 22/09/2026; esta migração é o registo no repositório.

CREATE OR REPLACE FUNCTION public.validate_paid_requires_payment_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  IF NEW.status = 'paid' AND NEW.payment_date IS NULL THEN
    RAISE EXCEPTION 'Transações pagas devem ter uma data de pagamento (payment_date)';
  END IF;

  IF NEW.payment_date IS NOT NULL AND NEW.payment_date > v_hoje THEN
    RAISE EXCEPTION 'Data de pagamento no futuro (%). Um pagamento regista dinheiro que já saiu — para uma saída prevista use a data de vencimento.', NEW.payment_date;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_payment_date_not_future()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  IF NEW.payment_date IS NOT NULL AND NEW.payment_date > v_hoje THEN
    RAISE EXCEPTION 'Data de pagamento no futuro (%). Um pagamento regista dinheiro que já saiu — para uma saída prevista use a data de vencimento na transação.', NEW.payment_date;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_payment_date_not_future ON public.transaction_payments;

CREATE TRIGGER enforce_payment_date_not_future
BEFORE INSERT OR UPDATE ON public.transaction_payments
FOR EACH ROW EXECUTE FUNCTION public.validate_payment_date_not_future();
