-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:relation:crm.meta_creatives
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "573f199f3b1d0d9be7eddc4a0cce71687a1c8093a3d166b7dae9d85a8dfe1e0a", "oid": 81469, "oid_catalog_query_sha256": "f76c9fbe999494c50d25221281e0accb7508e5b83e3f2752b06fb18ba25837f0", "oid_observation_scope": "catalogue identifier only; frozen definition/property hash remains separately dated", "oid_observed_at_utc": "2026-10-27 20:10:13.900178+00", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 97b437133bfe35d49ae2d198f2f53e8df0f85cb887f3bba6360d1b82ecc4d95e
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON TABLE crm.meta_creatives FROM "service_role";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT DELETE ON TABLE crm.meta_creatives TO "service_role";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT INSERT ON TABLE crm.meta_creatives TO "service_role";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT SELECT ON TABLE crm.meta_creatives TO "service_role";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT UPDATE ON TABLE crm.meta_creatives TO "service_role";
RESET ROLE;
-- END OPERATION 97b437133bfe35d49ae2d198f2f53e8df0f85cb887f3bba6360d1b82ecc4d95e
