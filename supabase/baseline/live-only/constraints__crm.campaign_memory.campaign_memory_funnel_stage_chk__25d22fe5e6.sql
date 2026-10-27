-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:crm.campaign_memory.campaign_memory_funnel_stage_chk
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "d99b42aaad22b33a05cac125626df9f4974c3018c80a079cc07479cab3fe15f7", "live_properties_sha256": "c8ed477f12864fb567ca89d3482b704e8a2190555af63fd6dfac57684a0f7cba", "oid": 163353, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "0e2b17f0d1328394a4f2baf3678006ab046ac8c7cf39791304db7521efa5eac2", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION dfc7a52f1dc1c2957be2ca087f0252fa3a89f1c569aaf15d9956d3c5d94ac814
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crm.campaign_memory'::regclass AND conname='campaign_memory_funnel_stage_chk') THEN
  ALTER TABLE crm.campaign_memory ADD CONSTRAINT campaign_memory_funnel_stage_chk CHECK (funnel_stage IS NULL OR (funnel_stage = ANY (ARRAY['frio'::text, 'quente'::text])));
 END IF;
END $baseline_constraint$;
-- END OPERATION dfc7a52f1dc1c2957be2ca087f0252fa3a89f1c569aaf15d9956d3c5d94ac814
