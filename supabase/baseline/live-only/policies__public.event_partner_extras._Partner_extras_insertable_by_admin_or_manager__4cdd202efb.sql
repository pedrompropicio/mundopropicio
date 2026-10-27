-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:public.event_partner_extras."Partner extras insertable by admin or manager"
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "53b9919a18c4b99d615d2d5d59944f5370c78ee4173a20fc881eca19b9b6dd1c", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "0ffe1e4526f9807796f1adaf7df2939def68f2346f5b7ee54c9664a2f09b2438", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "625d674b77229bdbe0bc41526869bd6cbafa3e8b84866f7837430cbe8facf961", "window": "after tail, before final ACL"}
-- BEGIN OPERATION b61c3d3ef5cd68b6208bf743e2a865e9e4d75df9a40b878be52a6a546788fc86
DROP POLICY IF EXISTS "Partner extras insertable by admin or manager" ON public.event_partner_extras;
-- END OPERATION b61c3d3ef5cd68b6208bf743e2a865e9e4d75df9a40b878be52a6a546788fc86
