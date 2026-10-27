-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:storage.objects."Closing cost docs viewable by authenticated"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "41a6cd4ce37abca99ddc9ac661adb3df0cd9ad4af06ff9b8113b8f6978555a62", "oid": 109906, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "27f5329508fea0a3e0fd7d1c8e024d82589a50dd4ead77618c1be772a10be677", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION b05cbf82d109fb5c4bb2fd21add8b7f2015a00ef3e9e858d73a5e8c0ccbb0e9c
DROP POLICY IF EXISTS "Closing cost docs viewable by authenticated" ON storage.objects;

CREATE POLICY "Closing cost docs viewable by authenticated" ON storage.objects AS PERMISSIVE FOR SELECT TO "authenticated" USING ((bucket_id = 'closing-cost-documents'::text));
-- END OPERATION b05cbf82d109fb5c4bb2fd21add8b7f2015a00ef3e9e858d73a5e8c0ccbb0e9c
