-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.slugify(pg_catalog.text)
-- stage: historical
-- provenance: {"effective_at": "2026-07-01T01:24:33Z", "live_catalog_sha256": "3082fc6db6930202445014f9996c52c59583dd1f23015604d3aed78a0fd06934", "live_definition_sha256": "996d3c0e26bad473400f7456edb31ecaeda4a3b799edf3a94293351afc56d798", "live_properties_sha256": "b51ef347c4b8e508e5bf3cc6353b038547250b8ebc3fd8c05f80db7d4d16e83e", "oid": 170934, "review": 6423818497, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "9849a67505cff7c9a6957045c3e444df9ac70ada096a7f929eeadade3c0769c0", "window": {"at": 1782869073000}}
-- BEGIN OPERATION 7265b403f500d3067139c6c087032c51680284f289af9982138957b3f3f9b3d0
CREATE OR REPLACE FUNCTION public.slugify(txt text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select nullif(trim(both '-' from
    regexp_replace(
      translate(lower(coalesce(txt,'')),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'),
      '[^a-z0-9]+', '-', 'g'
    )), '');
$function$

;

ALTER FUNCTION "public"."slugify"(txt text) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."slugify"(txt text) FROM PUBLIC;

DO $function_acl_reset$ DECLARE r record; BEGIN FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='"public"."slugify"(text)'::regprocedure LOOP EXECUTE 'REVOKE ALL ON FUNCTION "public"."slugify"(txt text) FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END; END LOOP; END $function_acl_reset$;

GRANT EXECUTE ON FUNCTION "public"."slugify"(txt text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."slugify"(txt text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."slugify"(txt text) TO "anon";

GRANT EXECUTE ON FUNCTION "public"."slugify"(txt text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."slugify"(txt text) TO "service_role";
-- END OPERATION 7265b403f500d3067139c6c087032c51680284f289af9982138957b3f3f9b3d0
