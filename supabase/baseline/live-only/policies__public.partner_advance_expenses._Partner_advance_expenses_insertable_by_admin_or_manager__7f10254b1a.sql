-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:public.partner_advance_expenses."Partner advance expenses insertable by admin or manager"
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "3d9eb55323736febe02c197ba4c15f6bfbbfbc6fe374c29833d22bed99a64be1", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "28f8d61901d2e0aa0cbef7e0e2652328a598f89c9d85c05d6284a83ab91d1947", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "e75794d8fe09db53f4e37313200312ecee50491c77918ba51831504f1fa56d8a", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 7a8c45d83ca393cd4a85d99c6ad8899d10ce972b919a2ea2bf58d91379a826be
DROP POLICY IF EXISTS "Partner advance expenses insertable by admin or manager" ON public.partner_advance_expenses;
-- END OPERATION 7a8c45d83ca393cd4a85d99c6ad8899d10ce972b919a2ea2bf58d91379a826be
