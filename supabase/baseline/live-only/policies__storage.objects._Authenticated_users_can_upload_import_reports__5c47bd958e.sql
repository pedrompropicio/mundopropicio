-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:storage.objects."Authenticated users can upload import reports"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "583036f99b0058b5be95c175a63afd179f23275a6429986002a0ab1591595b3e", "oid": 63709, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "dec779e57b0502c3b74e3cac3346912b302aa2b01ec52bf503ccc0ffb9ab5375", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 8cb4a56731b4c9bdfffec54fdf0dc8cb630c3ddd14c4ed2e3c017eeb2d472400
DROP POLICY IF EXISTS "Authenticated users can upload import reports" ON storage.objects;

CREATE POLICY "Authenticated users can upload import reports" ON storage.objects AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((bucket_id = 'import-reports'::text));
-- END OPERATION 8cb4a56731b4c9bdfffec54fdf0dc8cb630c3ddd14c4ed2e3c017eeb2d472400
