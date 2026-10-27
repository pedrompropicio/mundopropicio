-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:storage.objects_bucket_id_name_version_key
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "df31434dd56befcd0e6ad218fc812b758c7d8376bc463ac8df92d403592eaa4d", "live_properties_sha256": "20e596e0ced04d93da930fd35e6fc9fddc818e70297fd241ebb69e7351854942", "oid": 208016, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "d0e3b020b6e580e6e8fa703fb5ddf771fc84fda5fc894de3ecdc2f3a3f1948a9", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 8fa3261b77fb09614414247306ca3593ae6ff65356902b1d6a33c6d353cb30b9
CREATE UNIQUE INDEX IF NOT EXISTS objects_bucket_id_name_version_key ON storage.objects USING btree (bucket_id, name COLLATE "C", version) NULLS NOT DISTINCT;
-- END OPERATION 8fa3261b77fb09614414247306ca3593ae6ff65356902b1d6a33c6d353cb30b9
