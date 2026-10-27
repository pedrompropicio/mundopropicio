-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.transactions.transactions_service_payment_requires_mb
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "95df0352ad7a663f5289f61122a63f5f4f206411ab6cf46a19b131951087afeb", "live_properties_sha256": "5f02ea4883e612a1ffa3bf59e5beb48aafe33c7f678725458558243f654ab9fb", "oid": 227757, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "b23a733d0c045078ff94c9c94649635c92fc0278cc329a88083544e03e004b7e", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 601d138022c17c1e8f48cdff757cf8766a47ab458f0972ee0e91911791911721
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_service_payment_requires_mb') THEN
  ALTER TABLE public.transactions ADD CONSTRAINT transactions_service_payment_requires_mb CHECK (payment_method <> 'service_payment'::text OR payment_entity ~ '^\d{5}$'::text AND payment_reference ~ '^\d{9}$'::text) NOT VALID;
 END IF;
END $baseline_constraint$;
-- END OPERATION 601d138022c17c1e8f48cdff757cf8766a47ab458f0972ee0e91911791911721
