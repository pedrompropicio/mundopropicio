-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:storage.idx_objects_null_version
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "b6663ffa89a44f12f8e8250d3e9f26b26bcc20dadc0995d8ba60cd494e402981", "live_properties_sha256": "c90c390e561f9d5b9f14da53807abd203aa07dc1663afb123986030310882411", "oid": 208018, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "9a516891f10ffedaa16f5e1c9c14482c4e54ee4174ab0bff3b85218672880031", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 83cb5e7092683d21d1a1d0194e93c0dd3947fdc9752506c98bfb3a7906159ed5
CREATE UNIQUE INDEX IF NOT EXISTS idx_objects_null_version ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE (NOT is_versioned);
-- END OPERATION 83cb5e7092683d21d1a1d0194e93c0dd3947fdc9752506c98bfb3a7906159ed5
