-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.sync_partner_aporte_mirror()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "42d80ba8078e02bedb2f4473cc5a621f277b301fcfe75318c2edab50a0f005f8", "oid": 208134, "oid_catalog_query_sha256": "f76c9fbe999494c50d25221281e0accb7508e5b83e3f2752b06fb18ba25837f0", "oid_observation_scope": "catalogue identifier only; frozen definition/property hash remains separately dated", "oid_observed_at_utc": "2026-10-27 20:10:13.900178+00", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 6357318106742e61dd32d0235ff593356151966c0cf8e661e7073a73aeafa1c4
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.sync_partner_aporte_mirror() FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.sync_partner_aporte_mirror() FROM "anon";
RESET ROLE;
-- END OPERATION 6357318106742e61dd32d0235ff593356151966c0cf8e661e7073a73aeafa1c4
