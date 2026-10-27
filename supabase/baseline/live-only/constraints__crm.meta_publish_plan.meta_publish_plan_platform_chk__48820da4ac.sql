-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:crm.meta_publish_plan.meta_publish_plan_platform_chk
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "8805a4df2b7dbc911fcb4502393d665d2f45d029a06406017935f63bd2256b7b", "live_properties_sha256": "891310649effd844de45c192f30fd47efe7db8703cb6f6148b3e4fc3211ad99a", "oid": 239808, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "999671739cc7cde618ce64e7af63d08f9a5f11ef4c81b8effc1ae8157b4e765c", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION a4af0aeceb46b3634f0700346261b26d40577984771f489fad59c7e96119f794
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crm.meta_publish_plan'::regclass AND conname='meta_publish_plan_platform_chk') THEN
  ALTER TABLE crm.meta_publish_plan ADD CONSTRAINT meta_publish_plan_platform_chk CHECK (platform = ANY (ARRAY['meta'::text, 'tiktok'::text, 'google'::text]));
 END IF;
END $baseline_constraint$;
-- END OPERATION a4af0aeceb46b3634f0700346261b26d40577984771f489fad59c7e96119f794
