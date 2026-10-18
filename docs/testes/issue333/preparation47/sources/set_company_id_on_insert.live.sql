CREATE OR REPLACE FUNCTION public.set_company_id_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_company_id();
    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'company_id cannot be NULL — user has no associated company';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
