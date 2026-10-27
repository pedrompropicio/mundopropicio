-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:storage.objects."Authenticated users can view import reports"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "8ffd812afc601ce5a77d66ed28afec5b81b4f8fab07ddc181a45b985d415667e", "oid": 109890, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "c0e48520c8950a656279e8e853000e03831ed6688db5b94775a93dd4412397fd", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION eef474dc94d4ba3f5b4be51b8bd4100f45123abac6fe0705f4bd38a3d2af9772
DROP POLICY IF EXISTS "Authenticated users can view import reports" ON storage.objects;

CREATE POLICY "Authenticated users can view import reports" ON storage.objects AS PERMISSIVE FOR SELECT TO "authenticated" USING ((bucket_id = 'import-reports'::text));
-- END OPERATION eef474dc94d4ba3f5b4be51b8bd4100f45123abac6fe0705f4bd38a3d2af9772
