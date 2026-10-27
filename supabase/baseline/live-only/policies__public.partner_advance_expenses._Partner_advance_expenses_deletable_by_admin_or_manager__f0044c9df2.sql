-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:public.partner_advance_expenses."Partner advance expenses deletable by admin or manager"
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "3d9eb55323736febe02c197ba4c15f6bfbbfbc6fe374c29833d22bed99a64be1", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "fdcf4fbea0e2bceab7408d59b228df2bccf6cf8e04b6abb24dc70d057c29352c", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "4c55e46b3d7f9167bfc27f20bc028af9272810ab6ce251e52c077a70a65057c7", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 74e7b1def71ed99662154919c9bf8bbdf66fe21b44e023bef2af09fceea20e03
DROP POLICY IF EXISTS "Partner advance expenses deletable by admin or manager" ON public.partner_advance_expenses;
-- END OPERATION 74e7b1def71ed99662154919c9bf8bbdf66fe21b44e023bef2af09fceea20e03
