-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.artist_ads_plan_create(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,pg_catalog.jsonb)
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "a352da7d13e494a591afd3faa5f399bd03f90af3de3fcf3c5a2db6287231180f", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "62133f9d3b7d7837d363ed3d46364a85ad0e625a16f5152c599bca5b551e1145", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "de518b663f339f14563c6f8410506c3fbd9fd95bfc4f3114f1a921bc212668b5", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 05db5db76b8f246eb3ab7ef6eafaf1c9ee103ffda0ce3aa99402216f1e99d5d3
DROP FUNCTION IF EXISTS public.artist_ads_plan_create(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,pg_catalog.jsonb);
-- END OPERATION 05db5db76b8f246eb3ab7ef6eafaf1c9ee103ffda0ce3aa99402216f1e99d5d3
