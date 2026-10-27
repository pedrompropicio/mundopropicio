-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:storage.objects."Closing cost docs updatable by authenticated"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "ae7de53179cf316f912aaf0d1c4ca5af084abf0f6e33dc84ded1aa6425387373", "oid": 109904, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "ba070ab9b679157c789fd3cb6b6f2766585b0c9077917b52669098bce38171d5", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 51958a26d4ee46fbe44a1903e7bbb0fc724e8c291ba6f6125549c6f7050e5911
DROP POLICY IF EXISTS "Closing cost docs updatable by authenticated" ON storage.objects;

CREATE POLICY "Closing cost docs updatable by authenticated" ON storage.objects AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((bucket_id = 'closing-cost-documents'::text));
-- END OPERATION 51958a26d4ee46fbe44a1903e7bbb0fc724e8c291ba6f6125549c6f7050e5911
