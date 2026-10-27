-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.enforce_event_reopen_permission()
-- stage: historical
-- provenance: {"effective_at": "2026-09-14T13:54:33Z", "live_catalog_sha256": "c1aaaf009fede41264d7cd0c033a82be5e65bc83f2c7c974391f077f78d347bc", "live_definition_sha256": "a032f860be78af73d92ba47c6c2cff864266206cc47751a8bdb7ef12f74d5f3d", "live_properties_sha256": "303b6c04174db3624dfd7309378f7d5b1dc505cc47c7fcfefecbeefd04a2b27b", "oid": 223270, "review": 6423818497, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "25db8b5cb186a8debff92d7b7349da18acf6be7b98adf8cc8ea32ae424103189", "window": {"at": 1789394073000}}
-- BEGIN OPERATION 7282b1a2cfb40f90f06cb752ad2c9b82999f49e9d2f02f6bc18caa745309c4d0
CREATE OR REPLACE FUNCTION public.enforce_event_reopen_permission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só morde ao SAIR de 'completed'. Fechar continua guardado pelo
  -- enforce_event_close_blockers, que não se toca.
  IF OLD.status IS DISTINCT FROM 'completed' OR NEW.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- crons, syncs e edge functions com service_role: sem identidade de utilizador.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR public.has_permission_in(auth.uid(), 'reopen_event', NEW.company_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissao para reabrir um evento concluido.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$

;

ALTER FUNCTION "public"."enforce_event_reopen_permission"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_event_reopen_permission"() FROM PUBLIC;

DO $function_acl_reset$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"public"."enforce_event_reopen_permission"()'::regprocedure LOOP EXECUTE 'REVOKE ALL ON FUNCTION "public"."enforce_event_reopen_permission"() FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $function_acl_reset$;

GRANT EXECUTE ON FUNCTION "public"."enforce_event_reopen_permission"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_event_reopen_permission"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."enforce_event_reopen_permission"() TO "service_role";
-- END OPERATION 7282b1a2cfb40f90f06cb752ad2c9b82999f49e9d2f02f6bc18caa745309c4d0
