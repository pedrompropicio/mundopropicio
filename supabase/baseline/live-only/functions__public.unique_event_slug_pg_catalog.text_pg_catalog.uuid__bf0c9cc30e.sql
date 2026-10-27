-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.unique_event_slug(pg_catalog.text,pg_catalog.uuid)
-- stage: historical
-- provenance: {"effective_at": "2026-07-01T01:24:34Z", "live_catalog_sha256": "1c2d9d6dc49cc18e5571a317996fcf977a5b54a86789d3345f5ad5c360bfaf33", "live_definition_sha256": "6926134bd5cfb16d252ce241355e7926f3bff6619d4facb77d43454eb83af2e5", "live_properties_sha256": "9f5c95e8e260d60b7f31e8a34c56ac48b9b49a2e75f04197874022dcf3c6ebd4", "oid": 170935, "review": 6423818497, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "4d274deb54f592bd4cde468d22095a689a38ca00072bf9c5ba2ea7a79ff901be", "window": {"at": 1782869074000}}
-- BEGIN OPERATION 7e3cd91c2c3dd55071312645c880d066943c73eaa6063f8454936a8c1be43b19
CREATE OR REPLACE FUNCTION public.unique_event_slug(base text, exclude_id uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare s text := coalesce(base,'evento'); i int := 2;
begin
  if s = '' or s is null then s := 'evento'; end if;
  while exists (
    select 1 from public.events
    where slug = s and id <> coalesce(exclude_id,'00000000-0000-0000-0000-000000000000'::uuid)
  ) loop
    s := base || '-' || i; i := i + 1;
  end loop;
  return s;
end $function$

;

ALTER FUNCTION "public"."unique_event_slug"(base text, exclude_id uuid) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."unique_event_slug"(base text, exclude_id uuid) FROM PUBLIC;

DO $function_acl_reset$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"public"."unique_event_slug"(text, uuid)'::regprocedure LOOP EXECUTE 'REVOKE ALL ON FUNCTION "public"."unique_event_slug"(base text, exclude_id uuid) FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $function_acl_reset$;

GRANT EXECUTE ON FUNCTION "public"."unique_event_slug"(base text, exclude_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."unique_event_slug"(base text, exclude_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."unique_event_slug"(base text, exclude_id uuid) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."unique_event_slug"(base text, exclude_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."unique_event_slug"(base text, exclude_id uuid) TO "service_role";
-- END OPERATION 7e3cd91c2c3dd55071312645c880d066943c73eaa6063f8454936a8c1be43b19
