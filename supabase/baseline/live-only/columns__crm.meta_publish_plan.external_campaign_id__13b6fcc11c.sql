-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:crm.meta_publish_plan.external_campaign_id
-- stage: tail
-- provenance: {"attnum": 29, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "498fb9cf1e85875aca260d744fc2eaeb166851056a7f40b5d9819855800e541e", "oid": 157927, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "6cd2820afed9fad0e96420463096205810db21282ad3f823d4b541b0ba7282b6", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 1cf8ae4c997f572c2b88d0435c07a007c51efca2a03e8594fb3fcd6f0a600d5a
ALTER TABLE crm.meta_publish_plan ADD COLUMN IF NOT EXISTS external_campaign_id text;
-- END OPERATION 1cf8ae4c997f572c2b88d0435c07a007c51efca2a03e8594fb3fcd6f0a600d5a
