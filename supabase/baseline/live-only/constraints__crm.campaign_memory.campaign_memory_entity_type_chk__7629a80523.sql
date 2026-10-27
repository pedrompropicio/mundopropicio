-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:crm.campaign_memory.campaign_memory_entity_type_chk
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "27735a1130bf0c1e9d43149fe6b2ae0901149e4a0dd180dad67b942b31590810", "live_properties_sha256": "3264e65e97c1802e09bd61e20229399fe28be11e05f0252b23cccf05e54b5ea0", "oid": 162728, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "2527b3808b373bd9cf085498def31677937a71674a70f92b8959cc83b114cada", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION ef19e058c3ce6f3315ba6fbe566e85c9ede5abb50de7236334e5d1eb77cc0433
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crm.campaign_memory'::regclass AND conname='campaign_memory_entity_type_chk') THEN
  ALTER TABLE crm.campaign_memory ADD CONSTRAINT campaign_memory_entity_type_chk CHECK (entity_type IS NULL OR (entity_type = ANY (ARRAY['artista'::text, 'festival'::text, 'outro'::text])));
 END IF;
END $baseline_constraint$;
-- END OPERATION ef19e058c3ce6f3315ba6fbe566e85c9ede5abb50de7236334e5d1eb77cc0433
