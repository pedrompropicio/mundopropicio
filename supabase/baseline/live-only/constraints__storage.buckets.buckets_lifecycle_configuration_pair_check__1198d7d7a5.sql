-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:storage.buckets.buckets_lifecycle_configuration_pair_check
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "4ea243092f713e71fda46b95b119d274261ae90b7520952db0a0d2af8dca8acf", "live_properties_sha256": "7a7f2f1a7e05d262de3b735dbc406e3649beb2c2a5fb23ceb0487fc1784d11df", "oid": 249013, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "31c283dd4dd2436a206aafad9252d85719e8e3f37db20490f731cb0e24744217", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 0c5cce296e39dd802957c27ed6afbb9795102bf17a31507f7ddbc550e1966bdb
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='storage.buckets'::regclass AND conname='buckets_lifecycle_configuration_pair_check') THEN
  ALTER TABLE storage.buckets ADD CONSTRAINT buckets_lifecycle_configuration_pair_check CHECK ((lifecycle_configuration IS NULL) = (lifecycle_configuration_generation IS NULL));
 END IF;
END $baseline_constraint$;
-- END OPERATION 0c5cce296e39dd802957c27ed6afbb9795102bf17a31507f7ddbc550e1966bdb
