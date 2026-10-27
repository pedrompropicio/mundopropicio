-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:crm.campaign_memory.campaign_memory_audience_axis_chk
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "f454f8954a0254b20a431fc4f01067c28996e5c595579db1b6116a6a9889a93e", "live_properties_sha256": "d440926fd1b9fc77ef8303545c70158961fbef2df3a2c7e133c926888614e6ba", "oid": 162729, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "ef776c17707716d1311807ae76fab909e23ec0c277375075d82aea664934ab7e", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION fe57d54fd07b781f267b327489e39e0aea41a4d3d5d90f49d762f43d12ea9678
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crm.campaign_memory'::regclass AND conname='campaign_memory_audience_axis_chk') THEN
  ALTER TABLE crm.campaign_memory ADD CONSTRAINT campaign_memory_audience_axis_chk CHECK (audience_axis IS NULL OR (audience_axis = ANY (ARRAY['br'::text, 'pt'::text, 'ambos'::text])));
 END IF;
END $baseline_constraint$;
-- END OPERATION fe57d54fd07b781f267b327489e39e0aea41a4d3d5d90f49d762f43d12ea9678
