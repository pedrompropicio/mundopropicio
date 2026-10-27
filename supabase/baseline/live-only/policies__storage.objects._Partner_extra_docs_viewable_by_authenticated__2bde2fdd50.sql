-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:storage.objects."Partner extra docs viewable by authenticated"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "10a6e89fa6c15e4c4eb085ac2d97d548dd92c2768d416bf4dd3157523a17a506", "oid": 109913, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "8c53532ebb2582922bab0c66c16d019ec0cefa80112599b99f650dea245021c4", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION b114f7d346842a2fcf1eee12c626b218bf16d6851426c0ca8e6d4336feee0b2c
DROP POLICY IF EXISTS "Partner extra docs viewable by authenticated" ON storage.objects;

CREATE POLICY "Partner extra docs viewable by authenticated" ON storage.objects AS PERMISSIVE FOR SELECT TO "authenticated" USING ((bucket_id = 'partner-extra-documents'::text));
-- END OPERATION b114f7d346842a2fcf1eee12c626b218bf16d6851426c0ca8e6d4336feee0b2c
