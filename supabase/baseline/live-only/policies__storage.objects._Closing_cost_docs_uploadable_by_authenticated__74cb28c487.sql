-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:storage.objects."Closing cost docs uploadable by authenticated"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "5a6ec7e3797d488aee4b98e4bf2a798718334d8f3aa6ad85eaf8ce3a906ba5cc", "oid": 109905, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "091a0ea3f82da55cf8f3da37371ded1952fcf17f42a165e70d123cc38ffd0786", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION b33458db92a6e64f25a54c006b17fe5731fdd80c2995d692d9a3e9ef6842400f
DROP POLICY IF EXISTS "Closing cost docs uploadable by authenticated" ON storage.objects;

CREATE POLICY "Closing cost docs uploadable by authenticated" ON storage.objects AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((bucket_id = 'closing-cost-documents'::text));
-- END OPERATION b33458db92a6e64f25a54c006b17fe5731fdd80c2995d692d9a3e9ef6842400f
