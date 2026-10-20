CREATE OR REPLACE FUNCTION public.tosl_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_company uuid;
BEGIN
  SELECT status, company_id INTO v_status, v_company FROM public.ticket_office_statements
   WHERE id = COALESCE(NEW.statement_id, OLD.statement_id);
  IF v_status = 'confirmed' THEN
    RAISE EXCEPTION 'Apuramento Ticketline confirmado: as linhas não se alteram.';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'A linha tem de ser da mesma empresa do apuramento.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;
