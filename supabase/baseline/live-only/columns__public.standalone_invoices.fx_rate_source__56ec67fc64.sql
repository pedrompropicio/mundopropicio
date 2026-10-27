-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.standalone_invoices.fx_rate_source
-- stage: tail
-- provenance: {"attnum": 21, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "a9f04dfa3f35e1081948a3b2645bca112f23b1580fec830f4d66b8b1b29ca6b7", "oid": 178966, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "be3a2cbfa73bbc12a65bddff39301a2b289864ebded78a145a88d20f3963ac80", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 8fdf09054b8005bce6382634a2492aabd09160d3b9c4ab265a2b60abd5f4f6d8
ALTER TABLE public.standalone_invoices ADD COLUMN IF NOT EXISTS fx_rate_source text;
-- END OPERATION 8fdf09054b8005bce6382634a2492aabd09160d3b9c4ab265a2b60abd5f4f6d8
