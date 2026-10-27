-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.copy_event_tour_content(pg_catalog.uuid,pg_catalog._uuid,pg_catalog.bool,pg_catalog.bool,pg_catalog.bool)
-- stage: historical
-- provenance: {"effective_at": "2026-07-01T01:24:38Z", "live_catalog_sha256": "b7fc1af69d945d4dacdab0e392fc6cd7b0a1dcad44d248e6ccbab29160cf9452", "live_definition_sha256": "b56ca4879e7e06b1681ae92222b066a3567a61364a75681bb870fb60384516a8", "live_properties_sha256": "54d031e2a8caccfd3e709139e27277700a4f9115e2b2365734e43ec1453a7bb7", "oid": 171210, "review": 6423818497, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "9c22b9146f54fa25a072c601d3770536b53eded0cbfaf4817c9477f5c119cb4f", "window": {"at": 1782869078000}}
-- BEGIN OPERATION 63b78bb84f5e971db9456ba2ead5b46f789cb19b288e8768c0a7412eb9a2847e
CREATE OR REPLACE FUNCTION public.copy_event_tour_content(p_source uuid, p_targets uuid[], p_include_marketing boolean, p_include_faqs boolean, p_include_lineup boolean)
 RETURNS jsonb
 LANGUAGE sql
AS $function$
  select public.copy_event_tour_content(
    p_source, p_targets,
    p_include_marketing, p_include_marketing, p_include_faqs, p_include_lineup
  );
$function$

;

ALTER FUNCTION "public"."copy_event_tour_content"(p_source uuid, p_targets uuid[], p_include_marketing boolean, p_include_faqs boolean, p_include_lineup boolean) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."copy_event_tour_content"(p_source uuid, p_targets uuid[], p_include_marketing boolean, p_include_faqs boolean, p_include_lineup boolean) FROM PUBLIC;

DO $function_acl_reset$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"public"."copy_event_tour_content"(uuid, uuid[], boolean, boolean, boolean)'::regprocedure LOOP EXECUTE 'REVOKE ALL ON FUNCTION "public"."copy_event_tour_content"(p_source uuid, p_targets uuid[], p_include_marketing boolean, p_include_faqs boolean, p_include_lineup boolean) FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $function_acl_reset$;

GRANT EXECUTE ON FUNCTION "public"."copy_event_tour_content"(p_source uuid, p_targets uuid[], p_include_marketing boolean, p_include_faqs boolean, p_include_lineup boolean) TO PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."copy_event_tour_content"(p_source uuid, p_targets uuid[], p_include_marketing boolean, p_include_faqs boolean, p_include_lineup boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."copy_event_tour_content"(p_source uuid, p_targets uuid[], p_include_marketing boolean, p_include_faqs boolean, p_include_lineup boolean) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."copy_event_tour_content"(p_source uuid, p_targets uuid[], p_include_marketing boolean, p_include_faqs boolean, p_include_lineup boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."copy_event_tour_content"(p_source uuid, p_targets uuid[], p_include_marketing boolean, p_include_faqs boolean, p_include_lineup boolean) TO "service_role";
-- END OPERATION 63b78bb84f5e971db9456ba2ead5b46f789cb19b288e8768c0a7412eb9a2847e
