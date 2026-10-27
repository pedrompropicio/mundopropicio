-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:supabase_migrations.schema_migrations.schema_migrations_idempotency_key_key
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "92b0a4457b8879bcbf935d684d96606abe8ab79b5a20ce1c2a98f3086c5c900b", "live_properties_sha256": "8da88975d6d42b7670ceb9daf77f5eb9e18713ee4a9d41ae766538a7c322e210", "oid": 17419, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "f23529fdb0f171f96658eb3ee3dba86445416e559d2ab764ef93212381fbf625", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 0b2f1a7738af1646184b4873d4883ac1e256b30fdaefe091a2efb832a6e856a6
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='supabase_migrations.schema_migrations'::regclass AND conname='schema_migrations_idempotency_key_key') THEN
  ALTER TABLE supabase_migrations.schema_migrations ADD CONSTRAINT schema_migrations_idempotency_key_key UNIQUE (idempotency_key);
 END IF;
END $baseline_constraint$;
-- END OPERATION 0b2f1a7738af1646184b4873d4883ac1e256b30fdaefe091a2efb832a6e856a6
