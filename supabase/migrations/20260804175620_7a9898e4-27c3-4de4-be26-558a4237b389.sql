DO $migration$
DECLARE
  v_oid oid;
  v_definition text;
  v_patched text;
BEGIN
  SELECT p.oid
    INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'reverse_transaction'
     AND pg_get_function_identity_arguments(p.oid) = 'p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Função reverse_transaction de 5 argumentos não encontrada';
  END IF;

  v_definition := pg_get_functiondef(v_oid);
  v_patched := regexp_replace(
    v_definition,
    E'\\n[[:space:]]*manually_marked_paid = false,',
    '',
    'g'
  );
  v_patched := replace(
    v_patched,
    'pl.status IN (''approved'',''paid'')',
    'pl.status IN (''partially_approved'',''approved'',''paid'')'
  );

  IF v_patched = v_definition THEN
    RAISE EXCEPTION 'A função não continha os trechos esperados; migração abortada';
  END IF;

  EXECUTE v_patched;
END;
$migration$;

REVOKE ALL ON FUNCTION public.reverse_transaction(uuid, text, text, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(uuid, text, text, date, boolean) TO authenticated, service_role;