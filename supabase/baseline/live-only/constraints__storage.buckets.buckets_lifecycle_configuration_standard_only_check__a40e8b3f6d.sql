-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:storage.buckets.buckets_lifecycle_configuration_standard_only_check
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "a4f6b42bb47557f71b03b4b34a9bf3adff6c10611077c58127edc3d21cbcc14b", "live_properties_sha256": "49d1075a563ef8220dfa7c9a3d2e62938faf952be6fe01adcc31a86b4190c597", "oid": 249015, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "d949357c55a9c7194e25527ffd18ddff8806a2efeeb4850ee2fee329be1d0f54", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION d61e9677b321606a33780675215c60b34e21a224b40abec856b3c4b8a6bc2838
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='storage.buckets'::regclass AND conname='buckets_lifecycle_configuration_standard_only_check') THEN
  ALTER TABLE storage.buckets ADD CONSTRAINT buckets_lifecycle_configuration_standard_only_check CHECK (type = 'STANDARD'::storage.buckettype OR lifecycle_configuration IS NULL AND lifecycle_configuration_generation IS NULL);
 END IF;
END $baseline_constraint$;
-- END OPERATION d61e9677b321606a33780675215c60b34e21a224b40abec856b3c4b8a6bc2838
