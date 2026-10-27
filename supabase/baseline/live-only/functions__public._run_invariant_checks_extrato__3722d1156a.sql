-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public._run_invariant_checks_extrato()
-- stage: historical
-- provenance: {"effective_at": "2026-09-22T17:59:53Z", "live_catalog_sha256": "7faf09253c6c13bb01aea8f45cad18d0cd19d6ef8819485654db1fe601c7d758", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "4aa28f42ce3ed6b8ee1bdcf488bbc4f8680be332710f74398bf9f2f571dd33e3", "live_properties_sha256": "5f99c1979dc19a1847db62c269cd76c5760df402024e5f148c2f09f3ca3d5b1c", "oid": 254372, "review": 6414757497, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "e9f067d9949b3479c4325ffa68b1c4dc3a42e8f151af7e7e05cb01197f1d2746", "window": {"lower_oid": 253851, "lower_version": "20260922175952", "upper_oid": 255440, "upper_version": "20260923024639"}}
-- BEGIN OPERATION 9f3dbab0f4b74599a4534c2d29a9c6e0e6823662893e13b1119aea7f4215589a
CREATE OR REPLACE FUNCTION public._run_invariant_checks_extrato()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE cR bigint; sR jsonb;
BEGIN
  WITH ult AS (
    SELECT l.financial_account_id AS acc, max(l.booking_date) AS ate
      FROM public.bank_statement_lines l
     WHERE l.financial_account_id IS NOT NULL
     GROUP BY l.financial_account_id
  ),
  calc AS (
    SELECT a.name, u.ate,
           COALESCE(a.initial_balance,0) + COALESCE((
             SELECT sum(l2.amount) FROM public.bank_statement_lines l2
              WHERE l2.financial_account_id = a.id
                AND (a.initial_balance_date IS NULL OR l2.booking_date > a.initial_balance_date)
                AND l2.booking_date <= u.ate),0) AS banco,
           public._account_true_balance_asof_raw(a.id, u.ate) AS sistema
      FROM ult u JOIN public.financial_accounts a ON a.id = u.acc
  )
  SELECT count(*), COALESCE(jsonb_agg(to_jsonb(y)), '[]'::jsonb)
    INTO cR, sR
    FROM (SELECT c.name AS conta, c.ate AS ate_data,
                 round(c.banco,2) AS banco, round(c.sistema,2) AS sistema,
                 round(c.sistema - c.banco,2) AS diferenca
            FROM calc c
           WHERE c.sistema IS NOT NULL AND abs(c.sistema - c.banco) > 1.00
           ORDER BY abs(c.sistema - c.banco) DESC LIMIT 5) y;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cR, i.reference_count, (cR <= i.reference_count) AS conforme,
         i.notes, sR
    FROM public.system_invariants i
   WHERE i.name = 'saldo_conta_difere_do_extrato';
END;
$function$

;

ALTER FUNCTION "public"."_run_invariant_checks_extrato"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."_run_invariant_checks_extrato"() FROM PUBLIC;

DO $function_acl_reset$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"public"."_run_invariant_checks_extrato"()'::regprocedure LOOP EXECUTE 'REVOKE ALL ON FUNCTION "public"."_run_invariant_checks_extrato"() FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $function_acl_reset$;

GRANT EXECUTE ON FUNCTION "public"."_run_invariant_checks_extrato"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."_run_invariant_checks_extrato"() TO "service_role";
-- END OPERATION 9f3dbab0f4b74599a4534c2d29a9c6e0e6823662893e13b1119aea7f4215589a
