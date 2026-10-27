-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:crm.campaign_memory.funnel_stage
-- stage: tail
-- provenance: {"attnum": 29, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "6ec5171b2cfdbe28ada28c17c3834e9bb998829f2126981977d53dc671690f74", "oid": 162680, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "20adee635aa95c7277ee134be0827d06ece09e3af9e1ffa704ab5bf4ef47215d", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 9b27d35c38f385dda420db1d6750d222c8faf620edb081cece014f6d19d4494f
ALTER TABLE crm.campaign_memory ADD COLUMN IF NOT EXISTS funnel_stage text;
-- END OPERATION 9b27d35c38f385dda420db1d6750d222c8faf620edb081cece014f6d19d4494f
