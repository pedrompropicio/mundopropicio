DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.enforce_transaction_approval_permission()'::regprocedure);
  d := replace(d, $r$to_char(COALESCE(v_verba,0), 'FM999G999G990D00')$r$, $r$replace(to_char(COALESCE(v_verba,0), 'FM999999990.00'), '.', ',')$r$);
  d := replace(d, $r$to_char(v_real, 'FM999G999G990D00')$r$, $r$replace(to_char(v_real, 'FM999999990.00'), '.', ',')$r$);
  d := replace(d, $r$to_char(v_real - COALESCE(v_verba,0), 'FM999G999G990D00')$r$, $r$replace(to_char(v_real - COALESCE(v_verba,0), 'FM999999990.00'), '.', ',')$r$);
  IF position('FM999G999' in d) > 0 THEN RAISE EXCEPTION 'substituicao incompleta'; END IF;
  EXECUTE d;
END $mig$;