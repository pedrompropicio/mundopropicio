-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:supabase_migrations.schema_migrations.created_by
-- stage: tail
-- provenance: {"attnum": 4, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "a98cad5fcbd4b33a2858341f9ac727745ae40f48eccf061a510433066f21781a", "oid": 17411, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "3613597f92c39c9117aefdf68c15d258878053c918916132f48a8a19d1f4c38f", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 114bae3c07287379da4e033cf6ccc3bfd497392150f3df9eaa85ba06e4686ff6
ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN IF NOT EXISTS created_by text;
-- END OPERATION 114bae3c07287379da4e033cf6ccc3bfd497392150f3df9eaa85ba06e4686ff6
