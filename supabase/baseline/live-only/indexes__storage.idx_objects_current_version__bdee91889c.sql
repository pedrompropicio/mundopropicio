-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:storage.idx_objects_current_version
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "437f49b32411e31b6fc9e64a4c0cbd27d62d607889d5645c216d553d6455b027", "live_properties_sha256": "575f42c2032b1f1492ece9daab89f9764642fcb0774558998bf65eb69e3e4ea4", "oid": 208017, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "edba3d160330c9d2bc2967300735ab0962beda2d0b5f3ecb33e135562d7e300b", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION f093d35fbdec7a657e9b0c4e896c30415fdeaf030d09a83091f51c59ab5126c8
CREATE UNIQUE INDEX IF NOT EXISTS idx_objects_current_version ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE (archived_at IS NULL);
-- END OPERATION f093d35fbdec7a657e9b0c4e896c30415fdeaf030d09a83091f51c59ab5126c8
