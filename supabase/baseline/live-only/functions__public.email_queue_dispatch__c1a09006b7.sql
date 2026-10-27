-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.email_queue_dispatch()
-- stage: historical
-- provenance: {"effective_at": "2026-09-13T13:20:01Z", "live_catalog_sha256": "6336d8080bc5724b33bc73628785135b333cd8c3e5389f8b8c022f4069a20818", "live_definition_sha256": "4fbaf668afadeed7f21264b17b0b6e00e1b1f71d214b9506d53f0c74a1ffa9ff", "live_properties_sha256": "c43bfa42eb3f16d904c3b663cf49d5ae3033f12f0eace1bdd5aa6396806e11ed", "oid": 220840, "review": 6423818497, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "9657a54101e96a764067deecf3b9b378cc0ccc9f3d5ad4f877bf2e3016aa19f7", "window": {"at": 1789305601000}}
-- BEGIN OPERATION 1d0536f9d54c9293840f133ed1dd162e1efd00b8b634463e937cbb834f0f1fca
CREATE OR REPLACE FUNCTION public.email_queue_dispatch()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
     AND NOT EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
    BEGIN
      -- Serialize disarm against email_queue_wake on a shared advisory lock, then
      -- re-read under it: an enqueue racing the unschedule either committed (we
      -- see its row and leave the cron) or waits and re-arms after we commit.
      PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
      IF EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
         OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
        RETURN;
      END IF;
      PERFORM cron.unschedule('process-email-queue');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_dispatch: cron unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;

  IF (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now() THEN
    RETURN;
  END IF;

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
END;
$function$

;

ALTER FUNCTION "public"."email_queue_dispatch"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."email_queue_dispatch"() FROM PUBLIC;

DO $function_acl_reset$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"public"."email_queue_dispatch"()'::regprocedure LOOP EXECUTE 'REVOKE ALL ON FUNCTION "public"."email_queue_dispatch"() FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $function_acl_reset$;

GRANT EXECUTE ON FUNCTION "public"."email_queue_dispatch"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."email_queue_dispatch"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."email_queue_dispatch"() TO "service_role";
-- END OPERATION 1d0536f9d54c9293840f133ed1dd162e1efd00b8b634463e937cbb834f0f1fca
