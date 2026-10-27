-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:storage.buckets.versioning_status
-- stage: tail
-- provenance: {"attnum": 12, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "ebbadb97fe54733846fc1b7acc29f7da14de528abbca2759c1a6ef8fa74e311b", "oid": 17211, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "7bfaefb7971fc959690b9d833447a6f4a8f2394f5572547fba2281cd02b7ba1b", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 9410cf3cb42386728e678d64fd4d9709e44d8bac6eca609889c24d3642dae5b1
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS versioning_status text DEFAULT 'DISABLED'::text NOT NULL;
-- END OPERATION 9410cf3cb42386728e678d64fd4d9709e44d8bac6eca609889c24d3642dae5b1
