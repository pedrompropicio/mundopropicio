-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:storage.buckets.buckets_versioning_status_check
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "2565df75fa6c2fbd631c78fe568e46130f3f69b8cb1a8009e93ec7501b0b664f", "live_properties_sha256": "0687d002c58f82de519a7c7b25a9708cdf4bf6ad9f20eb85dd3aab2bf4a724e8", "oid": 180284, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "69616f967b7858254cb84ab88c25d28cc4fbff12c576063d7c9323fba569c9af", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 26675f3650f2c0acf2fef5b530e103c701c67bad53413f0b6f8a6b05e6c99f06
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='storage.buckets'::regclass AND conname='buckets_versioning_status_check') THEN
  ALTER TABLE storage.buckets ADD CONSTRAINT buckets_versioning_status_check CHECK (versioning_status = ANY (ARRAY['DISABLED'::text, 'ENABLED'::text, 'SUSPENDED'::text]));
 END IF;
END $baseline_constraint$;
-- END OPERATION 26675f3650f2c0acf2fef5b530e103c701c67bad53413f0b6f8a6b05e6c99f06
