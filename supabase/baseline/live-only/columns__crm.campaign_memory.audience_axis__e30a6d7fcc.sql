-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:crm.campaign_memory.audience_axis
-- stage: tail
-- provenance: {"attnum": 28, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "59cd0cad9c81ad5fe0d1604f7c6c772063b7a2d415183dc5129234bfc070d579", "oid": 162680, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "38b4856cbbf5e19288b10d6b568a342e093a0411309591563b7c46f413a5b420", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 708b7c22d15ecf5263f1ca31a97e48a4c36458d34e977b472d7af375c70a1639
ALTER TABLE crm.campaign_memory ADD COLUMN IF NOT EXISTS audience_axis text;
-- END OPERATION 708b7c22d15ecf5263f1ca31a97e48a4c36458d34e977b472d7af375c70a1639
