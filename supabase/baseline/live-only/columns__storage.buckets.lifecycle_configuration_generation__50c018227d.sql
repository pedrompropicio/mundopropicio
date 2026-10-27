-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:storage.buckets.lifecycle_configuration_generation
-- stage: tail
-- provenance: {"attnum": 14, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "b26389fc8cdc022c16e6f28fc8796a6257b8d1862a91e72eb0aacf2f97fd7d48", "oid": 17211, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "2b617a3368b4c82f064c8cbbade3a4eca62db021b3bcb5775eb65326191a2184", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 9ba12f8f7fc2b7e822d94f1ba11b671ad58e749f6431ebe7e86dc496e9b4ab42
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS lifecycle_configuration_generation uuid;
-- END OPERATION 9ba12f8f7fc2b7e822d94f1ba11b671ad58e749f6431ebe7e86dc496e9b4ab42
