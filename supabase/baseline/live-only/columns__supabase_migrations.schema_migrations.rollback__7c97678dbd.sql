-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:supabase_migrations.schema_migrations.rollback
-- stage: tail
-- provenance: {"attnum": 6, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "130ca3a9b6e6e2e0b8ca568be441bff94c57ad032e4b766458440f4b39baf700", "oid": 17411, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "ebb410655ede17195bbdb4b741cd16b6a39841735add13279fd46b50cae2296e", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION d0b21e8ab134e98a224039bc551c05582376d064150a66ae62fc0860d12e7890
ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN IF NOT EXISTS rollback text[];
-- END OPERATION d0b21e8ab134e98a224039bc551c05582376d064150a66ae62fc0860d12e7890
