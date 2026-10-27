-- #352 G3: local disposable replay only. Never apply to Live.
-- object: triggers:crm.meta_creatives.trg_meta_creatives_updated_at
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "f7b140cdaef8491ac5ed3dfae12432e8429e6b7ab7ac3e64da74f5f9313cf9e9", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "620d5ad4ed165bf936e05aedc2c27af451fecb2f337a69b02a18f0e83d23dc85", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "095a640bfafcb4326da6d443bc5d270034d2851ec4665126c99f5caa17eb2b34", "window": "after tail, before final ACL"}
-- BEGIN OPERATION f14946197798c34417c9d6ef471ab99d863c90af4ebf291c7377a34d878f2479
DROP TRIGGER IF EXISTS trg_meta_creatives_updated_at ON crm.meta_creatives;
-- END OPERATION f14946197798c34417c9d6ef471ab99d863c90af4ebf291c7377a34d878f2479
