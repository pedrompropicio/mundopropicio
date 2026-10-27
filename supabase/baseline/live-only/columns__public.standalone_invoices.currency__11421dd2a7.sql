-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.standalone_invoices.currency
-- stage: tail
-- provenance: {"attnum": 18, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "43592bac5e2eb7aaea281fa867c095c144761fbe56fa963051792359db6238be", "oid": 178966, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "b0d1f9642daf77e2de5b7e592e375910d02266a469b42523673a62690dec1b89", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 039fe740defe0f859d6db5dc76d1b13adbbc34538bbe4507b4eeafd37b74ff3e
ALTER TABLE public.standalone_invoices ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR'::text NOT NULL;
-- END OPERATION 039fe740defe0f859d6db5dc76d1b13adbbc34538bbe4507b4eeafd37b74ff3e
