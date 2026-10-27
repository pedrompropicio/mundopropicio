-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:crm.idx_msc_company
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "b7fbef63d81e041414dab81ca966a0ae62724c37956f8ba97541b22cb541e871", "live_properties_sha256": "373ddb53ca835a42bb81dd8614b5611c1d884635b2b287d1ef26c9c2c9be3bd0", "oid": 81707, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "f0b91ec0d889bff2a2125cc62428e381a5cd9d09c1c594c0fc4e8a7e2b3153cb", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION cf0630ddee2bbf12394242a38a2aa7fc2a9df601030b643f3ff66c7c6bd37013
CREATE INDEX IF NOT EXISTS idx_msc_company ON crm.meta_strategy_creatives USING btree (company_id);
-- END OPERATION cf0630ddee2bbf12394242a38a2aa7fc2a9df601030b643f3ff66c7c6bd37013
