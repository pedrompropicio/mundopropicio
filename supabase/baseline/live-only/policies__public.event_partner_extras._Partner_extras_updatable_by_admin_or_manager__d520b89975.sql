-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:public.event_partner_extras."Partner extras updatable by admin or manager"
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "53b9919a18c4b99d615d2d5d59944f5370c78ee4173a20fc881eca19b9b6dd1c", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "8542b7e0a0a3c26a6c9f7d7d4f4006d9f0a38bf9a62cfb5e59be9548e73c3242", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "973515e595f042dbd5655344b0a88ce7adf160a6f619b8c2b2adda0dc89df7eb", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 3016287f13fe20b558b4d5eed64432588262fde7d6b7308a7980cfebad727c04
DROP POLICY IF EXISTS "Partner extras updatable by admin or manager" ON public.event_partner_extras;
-- END OPERATION 3016287f13fe20b558b4d5eed64432588262fde7d6b7308a7980cfebad727c04
