-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:storage.idx_objects_delete_markers
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "2826a5f13f6af652d885c3d5c3535b8010dda167a5a2163edd23e5130a4c511c", "live_properties_sha256": "f0a839f69c6c9cea23823c8a17bb01ec8a0323b33b40c3d30047663b07324fee", "oid": 249030, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "b5e45fde6684b3f23bb4c3faab486e0e569fb83ddc92816a4d0eedac10eb2aa5", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 6f801dca0910f53b95e74a500b651c9c016e9da0d8b877900a32ff05d58bcbcc
CREATE INDEX IF NOT EXISTS idx_objects_delete_markers ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE is_delete_marker;
-- END OPERATION 6f801dca0910f53b95e74a500b651c9c016e9da0d8b877900a32ff05d58bcbcc
