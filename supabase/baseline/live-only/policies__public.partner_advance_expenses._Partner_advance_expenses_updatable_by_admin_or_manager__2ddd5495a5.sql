-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:public.partner_advance_expenses."Partner advance expenses updatable by admin or manager"
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "3d9eb55323736febe02c197ba4c15f6bfbbfbc6fe374c29833d22bed99a64be1", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "32d4b98a2e282c9c358bd043abb190df9aa71d07a5c9f38e204924a480ee0a48", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "47971fbbe4af0a0bba63e3735752afc1e52a18c395b49986c049e9e464ef3f78", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 92d5a1d15fbe55b8330456b859da6b9fd094e7c7f00af72aee011b9823e6c725
DROP POLICY IF EXISTS "Partner advance expenses updatable by admin or manager" ON public.partner_advance_expenses;
-- END OPERATION 92d5a1d15fbe55b8330456b859da6b9fd094e7c7f00af72aee011b9823e6c725
