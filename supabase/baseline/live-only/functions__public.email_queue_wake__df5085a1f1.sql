-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.email_queue_wake()
-- stage: historical
-- provenance: {"effective_at": "2026-09-13T13:20:02Z", "live_catalog_sha256": "c4c48801b4c220b3c43d2c33a6f5a813fe3156cd1c6f932e850a0f3e73fe9228", "live_definition_sha256": "1499f3e39b56bd9bd14f4c4b673e135154caddcf7fef2cca4ef2559c39698c27", "live_properties_sha256": "f2873a8824d86e459a1d926d5e1e4bb4a0647f5d54c9e5674526d7752f4a7d1f", "oid": 220841, "review": 6423818497, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "684ee1c39a3c0bba8e9fc979bbe63d27bdf56b41d3f2b7620d30d4a870b3600d", "window": {"at": 1789305602000}}
-- BEGIN OPERATION 4258a5050cdd4d357f3b84853a9882a348e356f8c0f1950336fdc1b71cfc83d2
CREATE OR REPLACE FUNCTION public.email_queue_wake()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Runs inside the enqueue transaction; the outer handler guarantees nothing
  -- below can roll back the customer's email. Shared advisory lock serializes
  -- arming against email_queue_dispatch's disarm.
  PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    BEGIN
      PERFORM cron.schedule('process-email-queue', '5 seconds', $cron$ SELECT public.email_queue_dispatch(); $cron$);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_wake: cron schedule failed: %', SQLERRM;
    END;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://homolog-project.supabase.invalid/functions/v1/process-email-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Lovable-Context', 'cron',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
        )
      ),
      body := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_queue_wake failed (enqueue preserved): %', SQLERRM;
  RETURN NULL;
END;
$function$

;

ALTER FUNCTION "public"."email_queue_wake"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."email_queue_wake"() FROM PUBLIC;

DO $function_acl_reset$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"public"."email_queue_wake"()'::regprocedure LOOP EXECUTE 'REVOKE ALL ON FUNCTION "public"."email_queue_wake"() FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $function_acl_reset$;

GRANT EXECUTE ON FUNCTION "public"."email_queue_wake"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."email_queue_wake"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."email_queue_wake"() TO "service_role";
-- END OPERATION 4258a5050cdd4d357f3b84853a9882a348e356f8c0f1950336fdc1b71cfc83d2
