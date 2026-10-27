-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:crm.meta_creatives.meta_creatives_type_check
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "7cd5ce4748db55c14b6d7485e13cd58eb1f9c6f74f1cb980cc81ef54221fb5c8", "live_properties_sha256": "51799a77ed1d77ce5562d1dd2c7419f0f1f5a5f84b00752764039c7e4044e809", "oid": 105589, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "b83bb9071f6dfbde576b8d56a990c618f73044de2fdac4e3c6f4630bbce349ca", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 52f20e2724653cc61a14669d8653e22bb759dffadd402fbfe19811bc73f8b253
ALTER TABLE crm.meta_creatives DROP CONSTRAINT IF EXISTS meta_creatives_type_check;

DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crm.meta_creatives'::regclass AND conname='meta_creatives_type_check') THEN
  ALTER TABLE crm.meta_creatives ADD CONSTRAINT meta_creatives_type_check CHECK (type = ANY (ARRAY['image'::text, 'video'::text, 'carousel'::text, 'banner'::text, 'unknown'::text, 'collection'::text, 'instant_experience'::text, 'dpa'::text]));
 END IF;
END $baseline_constraint$;
-- END OPERATION 52f20e2724653cc61a14669d8653e22bb759dffadd402fbfe19811bc73f8b253
