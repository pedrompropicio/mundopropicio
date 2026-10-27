-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:public.event_partner_extras."Partner extras deletable by admin or manager"
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "53b9919a18c4b99d615d2d5d59944f5370c78ee4173a20fc881eca19b9b6dd1c", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "60c277af630f91b5139332dd6c6e53d14d6f671ced3fde3577e621a1b9e2b49d", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "8b182b434cadf54b94addf258f2e3e9fa4f393a966db403a19713585db261498", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 019c54c443d991e110d2b3d7ff49567d3973a285bfa7c00b8cca85db4b90de87
DROP POLICY IF EXISTS "Partner extras deletable by admin or manager" ON public.event_partner_extras;
-- END OPERATION 019c54c443d991e110d2b3d7ff49567d3973a285bfa7c00b8cca85db4b90de87
