-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:storage.objects."Transaction docs deletable by privileged roles"
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "24c0bc49e48750c98e1f208baed5bdbd80ac87c7bdc1014ed0095d672ab54c97", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "8c917447c037916289b9fa55c7b9909ffb587dcc52086d1be182810f85d27897", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "8aaa92ceb765c087323ef59d6ba1eb2768473648d94c4e36c970c27f473130d6", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 9ebe3749a2b693290e1d54888edece3b60e4899890e569d8a4882a8527cbb67b
DROP POLICY IF EXISTS "Transaction docs deletable by privileged roles" ON storage.objects;
-- END OPERATION 9ebe3749a2b693290e1d54888edece3b60e4899890e569d8a4882a8527cbb67b
