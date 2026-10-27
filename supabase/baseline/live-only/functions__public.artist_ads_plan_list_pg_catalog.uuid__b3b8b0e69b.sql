-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.artist_ads_plan_list(pg_catalog.uuid)
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "00e7d666e5a7c078784e486328adff5708bdcba1e6a4b65f587481a3502c4f2e", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "8c2a6396e370c931a136a09d31fe34ede346fd8bd2106a34505f1c680fa7958f", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "c83c149cccf4949b64071f019ff9743ad0717b612de74705b833cbdc63d5c64c", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 9d888663da9fe01aac5d5adcc13785a5dce6198cb36f905cfe99dc67ef28a268
DROP FUNCTION IF EXISTS public.artist_ads_plan_list(pg_catalog.uuid);
-- END OPERATION 9d888663da9fe01aac5d5adcc13785a5dce6198cb36f905cfe99dc67ef28a268
