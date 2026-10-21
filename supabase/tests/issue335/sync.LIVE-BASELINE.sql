CREATE OR REPLACE FUNCTION public.sync_paid_amount_from_payments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  PERFORM public._derive_paid_amount(COALESCE(NEW.transaction_id, OLD.transaction_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$;
