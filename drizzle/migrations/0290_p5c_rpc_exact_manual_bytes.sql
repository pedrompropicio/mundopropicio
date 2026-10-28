DO $repair$
DECLARE
  v_oid oid := 'public.get_financial_position_base(uuid,integer)'::regprocedure;
  v_before text;
  v_after text;
  v_acl aclitem[];
  v_definition text;
BEGIN
  SELECT prosrc, proacl, pg_get_functiondef(oid) INTO v_before, v_acl, v_definition FROM pg_proc WHERE oid = v_oid;
  IF md5(v_before) <> '74cfde16a9603f86fc141a58fbf0d0ab' THEN
    RAISE EXCEPTION 'P5c precondition failed: unexpected RPC body %', md5(v_before);
  END IF;
  v_after := replace(v_before,
    E'\n                AND NOT EXISTS (SELECT 1 FROM public.event_forecasts pf',
    E'\n               AND NOT EXISTS (SELECT 1 FROM public.event_forecasts pf');
  v_after := replace(v_after,
    E'\n         WHERE tx.stage = s.stage AND tx.type = ''income'' AND NOT tx.is_transitory',
    E'\n        WHERE tx.stage = s.stage AND tx.type = ''income'' AND NOT tx.is_transitory');
  IF md5(v_after) <> 'dbbf47c34e4b0c3896cb7a34561358e3' THEN
    RAISE EXCEPTION 'P5c manual body mismatch: %', md5(v_after);
  END IF;
  -- pg_get_functiondef emits CREATE OR REPLACE with all existing attributes.
  -- Replace only the complete body; retain the exact existing ACL.
  EXECUTE replace(v_definition, v_before, v_after);
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_oid AND md5(prosrc) = 'dbbf47c34e4b0c3896cb7a34561358e3' AND proacl IS NOT DISTINCT FROM v_acl) THEN
    RAISE EXCEPTION 'P5c postcondition failed: body or ACL changed unexpectedly';
  END IF;
END
$repair$;