-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:storage.buckets.buckets_lifecycle_configuration_shape_check
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "278af6fba5a20af3ff2715a7fa9ca1173ec911d27589f72951a6acef946acb1f", "live_properties_sha256": "efe293d7ba624bd973510593427c259187d955d7d763078972dd0b6ec0d2bcd8", "oid": 249014, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "6e02fa7863d5785080f861d4e9bb41bb8134135faaf43c4f98039ab2be5924fb", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION e2e89e73509735389743061dcc58a79d753c0e5a23c1a67501c81ac760c8e3be
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='storage.buckets'::regclass AND conname='buckets_lifecycle_configuration_shape_check') THEN
  ALTER TABLE storage.buckets ADD CONSTRAINT buckets_lifecycle_configuration_shape_check CHECK (lifecycle_configuration IS NULL OR jsonb_typeof(lifecycle_configuration) = 'object'::text AND lifecycle_configuration ? 'rules'::text AND
CASE
    WHEN jsonb_typeof(lifecycle_configuration -> 'rules'::text) = 'array'::text THEN jsonb_array_length(lifecycle_configuration -> 'rules'::text) >= 1 AND jsonb_array_length(lifecycle_configuration -> 'rules'::text) <= 1000
    ELSE false
END);
 END IF;
END $baseline_constraint$;
-- END OPERATION e2e89e73509735389743061dcc58a79d753c0e5a23c1a67501c81ac760c8e3be
