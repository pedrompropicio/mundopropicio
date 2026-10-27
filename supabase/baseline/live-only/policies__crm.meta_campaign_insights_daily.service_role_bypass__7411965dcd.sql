-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:crm.meta_campaign_insights_daily.service_role_bypass
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "7235e0028296a85387c515cab5a3c06d4c329f41a963f8bf26450118a95457b8", "oid": 78794, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "ff0e2b6674d217613a947d4b298053957b016b788dd1298bd84f74796a795f19", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 9251dd54d22ecbf2afbe8af1adbf0f04767bdd9bdba989ed9564f94d4790456c
DROP POLICY IF EXISTS service_role_bypass ON crm.meta_campaign_insights_daily;

CREATE POLICY service_role_bypass ON crm.meta_campaign_insights_daily AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
-- END OPERATION 9251dd54d22ecbf2afbe8af1adbf0f04767bdd9bdba989ed9564f94d4790456c
