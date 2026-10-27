-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.get_app_secret(pg_catalog.text)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "oid": 125673, "oid_catalog_query_sha256": "f76c9fbe999494c50d25221281e0accb7508e5b83e3f2752b06fb18ba25837f0", "oid_observation_scope": "catalogue identifier only; frozen definition/property hash remains separately dated", "oid_observed_at_utc": "2026-10-27 20:10:13.900178+00", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION ce2c7b56d60f81a0958e59e7e25726d43012bbc0f590f4c526ba4670d37f0f98
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.get_app_secret(pg_catalog.text) FROM "authenticated";
RESET ROLE;
-- END OPERATION ce2c7b56d60f81a0958e59e7e25726d43012bbc0f590f4c526ba4670d37f0f98
