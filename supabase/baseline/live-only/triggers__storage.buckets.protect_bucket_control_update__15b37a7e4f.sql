-- #352 G3: local disposable replay only. Never apply to Live.
-- object: triggers:storage.buckets.protect_bucket_control_update
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "fff25903becd8ef98f74225ea9a56c4b05b44eee251bd4dccb884bbb97ce245d", "live_properties_sha256": "df7aa49d96a413509cd8fecd4e1c20578a304422cfc2ebfbf64d62eec5e53783", "oid": 249019, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "d450469182a1290f3138b467209e07f95617750b7f22c503ebfd4fe4f8f4c0f3", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 9e834e752cd765a0cc98499bb7092a6d44a924d9a4a1f848c382f043ce7edfc1
CREATE OR REPLACE TRIGGER protect_bucket_control_update BEFORE UPDATE OF lifecycle_configuration, lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_bucket_control_columns();

ALTER TABLE storage.buckets ENABLE TRIGGER protect_bucket_control_update;
-- END OPERATION 9e834e752cd765a0cc98499bb7092a6d44a924d9a4a1f848c382f043ce7edfc1
