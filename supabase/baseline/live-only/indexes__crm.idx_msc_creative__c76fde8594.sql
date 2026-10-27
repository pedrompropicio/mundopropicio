-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:crm.idx_msc_creative
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "653ecab33f025511185ff399ef5c0d1afb802ef992d02e1e43b9e60d10bbe3ba", "live_properties_sha256": "f64bba2f9d4994e912434af9b64d69b9bb9231ca44bbeccba786d1db1cd152b8", "oid": 81706, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "67d946982aaf6a9081cecda7a451ce249f75a34f0b517a42d966d42533a84439", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 4e8acdbe6c8f0154f25ff69abe1a272975d08a656548856d397bced8db45be1a
CREATE INDEX IF NOT EXISTS idx_msc_creative ON crm.meta_strategy_creatives USING btree (creative_id);
-- END OPERATION 4e8acdbe6c8f0154f25ff69abe1a272975d08a656548856d397bced8db45be1a
