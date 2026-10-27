-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.artist_ads_plan_list(pg_catalog.uuid,pg_catalog.text)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "42d80ba8078e02bedb2f4473cc5a621f277b301fcfe75318c2edab50a0f005f8", "oid": 239760, "oid_catalog_query_sha256": "f76c9fbe999494c50d25221281e0accb7508e5b83e3f2752b06fb18ba25837f0", "oid_observation_scope": "catalogue identifier only; frozen definition/property hash remains separately dated", "oid_observed_at_utc": "2026-10-27 20:10:13.900178+00", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 08d395fb47cf6aa648b159c16ea6b7f9531f489284e14a8c5f6577dad5762b76
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.artist_ads_plan_list(pg_catalog.uuid,pg_catalog.text) FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.artist_ads_plan_list(pg_catalog.uuid,pg_catalog.text) FROM "anon";
RESET ROLE;
-- END OPERATION 08d395fb47cf6aa648b159c16ea6b7f9531f489284e14a8c5f6577dad5762b76
