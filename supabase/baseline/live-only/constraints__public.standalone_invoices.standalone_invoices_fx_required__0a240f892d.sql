-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.standalone_invoices.standalone_invoices_fx_required
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "d2133edbf709e79f1ca6f63f8f4b7cb94ec4ba67dadc5f3207fb28c9376d7dbf", "live_properties_sha256": "b5c69d53da907e2d25fe741999cb13dbae02c62a177fef0d1d0e453a2382e63d", "oid": 231757, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "d3cd0d2fba7235d011992a2233d6c230aba92999363784d98c361feaf89bc7b5", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION c5f5a11f84621b291eb6aaa1fbbb89f1952dd918e0c42644b702234a1cab0701
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.standalone_invoices'::regclass AND conname='standalone_invoices_fx_required') THEN
  ALTER TABLE public.standalone_invoices ADD CONSTRAINT standalone_invoices_fx_required CHECK (currency = 'EUR'::text OR fx_rate IS NOT NULL AND original_amount IS NOT NULL);
 END IF;
END $baseline_constraint$;
-- END OPERATION c5f5a11f84621b291eb6aaa1fbbb89f1952dd918e0c42644b702234a1cab0701
