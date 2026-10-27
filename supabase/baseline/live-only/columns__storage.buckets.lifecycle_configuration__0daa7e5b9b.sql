-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:storage.buckets.lifecycle_configuration
-- stage: tail
-- provenance: {"attnum": 13, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "e73c260579baf0a8f07547e3965a03327bcf4cca85eee1f5db296118b2c74d77", "oid": 17211, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "3354a586deae907c3192b6f2b8a57cc83892e5722a43a8487a774eb608f0c344", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION cf434ef69ce135c26c765fcdb0decbbb72ac86767477f9e61bd51a5287b50970
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS lifecycle_configuration jsonb;
-- END OPERATION cf434ef69ce135c26c765fcdb0decbbb72ac86767477f9e61bd51a5287b50970
