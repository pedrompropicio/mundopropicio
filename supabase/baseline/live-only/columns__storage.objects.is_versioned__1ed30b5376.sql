-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:storage.objects.is_versioned
-- stage: tail
-- provenance: {"attnum": 15, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "5494fd4f99db1d6e5e957f1a2bf4237fc9dda9f9aabd0bd4af087db82b3cc0a6", "oid": 17221, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "bc76627d50c78dd514d57281f4d1dbff2e77f170560aab463d4b51a134491136", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 238a58f5c379fbdc9aa9c61f83490d8c5fee5161dc79477a3300269dd05c1614
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS is_versioned boolean DEFAULT false NOT NULL;
-- END OPERATION 238a58f5c379fbdc9aa9c61f83490d8c5fee5161dc79477a3300269dd05c1614
