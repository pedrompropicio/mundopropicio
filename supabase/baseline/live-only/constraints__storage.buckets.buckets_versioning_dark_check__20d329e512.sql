-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:storage.buckets.buckets_versioning_dark_check
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "12e975b3c36fa0a71188e90e4668e1e3264353f5f0b6b4b31b8be40456868de2", "live_properties_sha256": "b018495e9085b9b262a7f77a4bc20d4c8fe1eb5795023fa2a7ee6db65da9e347", "oid": 180286, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "4c4cf840ffce7dcdce2d62ca998298205eb38c7e1d1df5e99437c57544ac32fa", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION fe92f46e65e92acf1da84804db97dd50fea590879e2ab3d28cfb2ca32f1d1288
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='storage.buckets'::regclass AND conname='buckets_versioning_dark_check') THEN
  ALTER TABLE storage.buckets ADD CONSTRAINT buckets_versioning_dark_check CHECK (versioning_status = 'DISABLED'::text);
 END IF;
END $baseline_constraint$;
-- END OPERATION fe92f46e65e92acf1da84804db97dd50fea590879e2ab3d28cfb2ca32f1d1288
