-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:storage.buckets.buckets_versioning_standard_only_check
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "3be3d68491c8fd47fc9878f848c84bfd8748f92c3709925a9142b88c08767bd0", "live_properties_sha256": "9372d093ab8044fc746920e3c4abcbc413e2d9f59b147101ae38f647c0b0f2c0", "oid": 180285, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "5a25a728cbfed21a0d279e57116db60e96de199f88d7bba669761a25e86959e5", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION bde2d80e1ebdf68b2887ed95f7c3918da84a5fbee9fd44c4475c61da52943dbf
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='storage.buckets'::regclass AND conname='buckets_versioning_standard_only_check') THEN
  ALTER TABLE storage.buckets ADD CONSTRAINT buckets_versioning_standard_only_check CHECK (type = 'STANDARD'::storage.buckettype OR versioning_status = 'DISABLED'::text);
 END IF;
END $baseline_constraint$;
-- END OPERATION bde2d80e1ebdf68b2887ed95f7c3918da84a5fbee9fd44c4475c61da52943dbf
