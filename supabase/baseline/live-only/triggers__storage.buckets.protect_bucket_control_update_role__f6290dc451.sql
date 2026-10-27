-- #352 G3: local disposable replay only. Never apply to Live.
-- object: triggers:storage.buckets.protect_bucket_control_update_role
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "2fcecce16bd2112f9f7a1abe081d62c44e51bc04f948f8e7a2dee96e10be572f", "live_properties_sha256": "252c13865f15da23a95a3882d303a75ee922ec645699d8480e800242b114a002", "oid": 249020, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "db1d3922fc38a87e331bbd7bf07a59762061e2c59fa44ddedd2e167ef9e2d5f4", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION f6ae9c0f4070dc91f92f14e9455a13d7962ca83a9779309fbb11a67bc9bb7af5
CREATE OR REPLACE TRIGGER protect_bucket_control_update_role AFTER UPDATE OF lifecycle_configuration, lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_lifecycle_service_role('service_role');

ALTER TABLE storage.buckets ENABLE TRIGGER protect_bucket_control_update_role;
-- END OPERATION f6ae9c0f4070dc91f92f14e9455a13d7962ca83a9779309fbb11a67bc9bb7af5
