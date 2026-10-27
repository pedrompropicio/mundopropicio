-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:crm.campaign_memory.entity_type
-- stage: tail
-- provenance: {"attnum": 26, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "f12762e07b3518f6aea7adc94629b72da7d8c679f77983b8053057e3ca97298f", "oid": 162680, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "2e757706162cbc2bc7b78691b629110c7085aaa9ec0fa5af22b78fd7d6398533", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION f6963613fed8e80b3ea78afba50797f0346943560d29521ef678d98b8b45563d
ALTER TABLE crm.campaign_memory ADD COLUMN IF NOT EXISTS entity_type text;
-- END OPERATION f6963613fed8e80b3ea78afba50797f0346943560d29521ef678d98b8b45563d
