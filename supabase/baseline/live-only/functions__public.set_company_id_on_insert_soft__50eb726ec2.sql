-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.set_company_id_on_insert_soft()
-- stage: historical
-- provenance: {"effective_at": "2026-08-13T02:32:20Z", "live_catalog_sha256": "cd8c86883c23c9505694b269154823d785544ab1542793369e1d18fe4d84bc0b", "live_definition_sha256": "54a274ee768b4922dabe1e279d9a7699d5a78194c63602fe8965659109efb21b", "live_properties_sha256": "5759fa17519eedb58bf7ec68031e49e36026db5e802813a404496d2f74bfdf23", "oid": 180007, "review": 6423818497, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "a47e5ea2b8087e32d7cc3966ba5909dd4b3641850ea9991d5ce4d6a66b382252", "window": {"at": 1786588340000}}
-- BEGIN OPERATION c610d16897e9f9d859a06416ccbb41f368ac5c596e10af4098a9c3c14b294c44
CREATE OR REPLACE FUNCTION public.set_company_id_on_insert_soft()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Variante "soft" do set_company_id_on_insert, para tabelas de sistema
  -- escritas por processos service_role (sem auth.uid()).
  -- Preenche company_id quando há contexto de utilizador; caso contrário
  -- deixa NULL em vez de abortar o INSERT.
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_company_id();
  END IF;
  RETURN NEW;
END;
$function$

;

ALTER FUNCTION "public"."set_company_id_on_insert_soft"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_company_id_on_insert_soft"() FROM PUBLIC;

DO $function_acl_reset$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"public"."set_company_id_on_insert_soft"()'::regprocedure LOOP EXECUTE 'REVOKE ALL ON FUNCTION "public"."set_company_id_on_insert_soft"() FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $function_acl_reset$;

GRANT EXECUTE ON FUNCTION "public"."set_company_id_on_insert_soft"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_company_id_on_insert_soft"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."set_company_id_on_insert_soft"() TO "service_role";
-- END OPERATION c610d16897e9f9d859a06416ccbb41f368ac5c596e10af4098a9c3c14b294c44
