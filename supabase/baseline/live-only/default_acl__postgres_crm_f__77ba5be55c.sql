-- #352 G3: local disposable replay only. Never apply to Live.
-- object: default_acl:postgres:crm:f
-- stage: reconcile
-- provenance: {"live_absence": false, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "58b72d17f5fc7f7e5c82ba39e08b6ba59dd4abb3db0f241461624ea387ace4f0", "oid": 239520, "oid_catalog_query_sha256": "f76c9fbe999494c50d25221281e0accb7508e5b83e3f2752b06fb18ba25837f0", "oid_observation_scope": "catalogue identifier only; frozen definition/property hash remains separately dated", "oid_observed_at_utc": "2026-10-27 20:10:13.900178+00", "review": 6445145238, "rule": "live_only_tail", "source_sql_sha256": "dea655277318b02bf7433df482003e85eb97bf899b954da76f0b75d37b07f596", "window": "after tail, before final ACL"}
-- BEGIN OPERATION d00b4bee88274de87c538f0fa740336cefd34a307982fad07f23478bd61e36c2
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA crm GRANT EXECUTE ON FUNCTIONS TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA crm GRANT EXECUTE ON FUNCTIONS TO "service_role";
-- END OPERATION d00b4bee88274de87c538f0fa740336cefd34a307982fad07f23478bd61e36c2
