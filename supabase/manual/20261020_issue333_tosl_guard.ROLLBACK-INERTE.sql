-- #333 tosl_guard only; INERT candidate, never auto-apply. No data/gates/ACL changes.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $guard$
DECLARE f record;
BEGIN
 SELECT prosrc,proowner,proacl,prosecdef,proconfig INTO f FROM pg_proc WHERE oid='public.tosl_guard()'::regprocedure;
 IF md5(f.prosrc) IS DISTINCT FROM 'e35ed107ee7c371d34d5a6dd938e1de7' OR pg_get_userbyid(f.proowner) IS DISTINCT FROM 'postgres'
    OR f.prosecdef IS DISTINCT FROM true OR f.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[] THEN
   RAISE EXCEPTION '#333: tosl_guard_source_drift';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.ticket_office_statement_lines'::regclass
   AND tgname='trg_tosl_guard' AND tgfoid='public.tosl_guard()'::regprocedure AND tgtype=31 AND tgenabled='O') THEN
   RAISE EXCEPTION '#333: tosl_guard_trigger_drift';
 END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.confirm_ticket_office_statement(uuid)'::regprocedure)
   IS DISTINCT FROM '2e868bc2a28ec291581028f6dc579c6a' THEN RAISE EXCEPTION '#333: confirmation_drift'; END IF;
END $guard$;
-- CREATE OR REPLACE preserves current function identity, owner and explicit ACL.
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
COMMIT;
