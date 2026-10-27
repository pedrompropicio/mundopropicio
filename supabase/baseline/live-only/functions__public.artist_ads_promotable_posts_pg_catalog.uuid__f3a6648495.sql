-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.artist_ads_promotable_posts(pg_catalog.uuid)
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "245d0f388766ba32716a70e3ad2cf7852c699a5a2a10698bac39e5863ad73374", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "62c4baeb91171c867a7109a2afbab3b1d7e161204221298bcec45e7fa014ce71", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "2a184eb2be4d23025b5b7730566f7df7913630959e9e1cc8252e8eeee73225df", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 6990b61ed8f35377ccb63a62d6252aac9a5e9a0e45999567c5153b7a5e20812b
DROP FUNCTION IF EXISTS public.artist_ads_promotable_posts(pg_catalog.uuid);
-- END OPERATION 6990b61ed8f35377ccb63a62d6252aac9a5e9a0e45999567c5153b7a5e20812b
