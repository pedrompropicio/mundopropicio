-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:supabase_migrations.schema_migrations.idempotency_key
-- stage: tail
-- provenance: {"attnum": 5, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "8d901a1f0c3875b2c2233bc45407faa4540300d55eba020ad2e4e67a4881618b", "oid": 17411, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "e195d5b46bec789b7d64d5edec67138847c335147f9a165ab5b0df37dec3ee42", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 237450eeafa404058410c8f2fbdd408bce8cd54d015ff187a0c5c5fdb2194f24
ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN IF NOT EXISTS idempotency_key text;
-- END OPERATION 237450eeafa404058410c8f2fbdd408bce8cd54d015ff187a0c5c5fdb2194f24
