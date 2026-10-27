-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:storage.bucketid_objname
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "24c0bc49e48750c98e1f208baed5bdbd80ac87c7bdc1014ed0095d672ab54c97", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "797b3e46855436d87635c0d925d54b0022d855796e6f32a60b1def5b1d960b2d", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "d37c22d05fca16829ff2bf4363b94bc97c5d8932f474849fa633b74bfcd3ba45", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 2ee4b7c1c06cb95ebe46dc23d7c304d25f1846dffc67c7efce66ecab7c63e179
DROP INDEX IF EXISTS storage.bucketid_objname;
-- END OPERATION 2ee4b7c1c06cb95ebe46dc23d7c304d25f1846dffc67c7efce66ecab7c63e179
