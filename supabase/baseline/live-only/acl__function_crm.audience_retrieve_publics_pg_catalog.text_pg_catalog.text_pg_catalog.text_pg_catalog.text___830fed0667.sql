-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:crm.audience_retrieve_publics(pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "8e542fdfc523e8fab1ecff0060273744deb9385f6899df8d558a7a40e54253d6", "oid": 163582, "oid_catalog_query_sha256": "f76c9fbe999494c50d25221281e0accb7508e5b83e3f2752b06fb18ba25837f0", "oid_observation_scope": "catalogue identifier only; frozen definition/property hash remains separately dated", "oid_observed_at_utc": "2026-10-27 20:10:13.900178+00", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 2333ff4de621e1c69b009294d023f1a32dcdb96d42a9f5d9f7dfe76dc5d13726
SET LOCAL ROLE "postgres";
GRANT EXECUTE ON FUNCTION crm.audience_retrieve_publics(pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text) TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT EXECUTE ON FUNCTION crm.audience_retrieve_publics(pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text) TO "service_role";
RESET ROLE;
-- END OPERATION 2333ff4de621e1c69b009294d023f1a32dcdb96d42a9f5d9f7dfe76dc5d13726
