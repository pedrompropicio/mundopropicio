CREATE OR REPLACE FUNCTION public.tosl_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_company uuid; v_parent record; v_old uuid; v_new uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := OLD.statement_id; END IF;
  IF TG_OP <> 'DELETE' THEN v_new := NEW.statement_id; END IF;
  -- Both parents, deduplicated and ordered before checking their current state.
  -- NO KEY UPDATE conflicts with confirmation's FOR UPDATE, but not FK KEY SHARE.
  FOR v_parent IN
    SELECT id, status, company_id FROM public.ticket_office_statements
    WHERE id IN (v_old, v_new) ORDER BY id FOR NO KEY UPDATE
  LOOP
    IF v_parent.status = 'confirmed' THEN
      RAISE EXCEPTION 'Apuramento Ticketline confirmado: as linhas não se alteram.';
    END IF;
    IF v_parent.id = v_new THEN v_company := v_parent.company_id; END IF;
  END LOOP;
  IF TG_OP <> 'DELETE' AND NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'A linha tem de ser da mesma empresa do apuramento.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;
