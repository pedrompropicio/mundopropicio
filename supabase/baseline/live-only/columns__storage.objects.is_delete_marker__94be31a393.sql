-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:storage.objects.is_delete_marker
-- stage: tail
-- provenance: {"attnum": 14, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "d27afad9c77cd67654bc781041e1d279b879e5a798aa83bd3fed3fc20191a602", "oid": 17221, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "3619296e3681b98581742cf1093a3ba700ac5f588156ab6d0a7308287f7a9fa8", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 975fcadc251913e2dc511d91ee17db5ceeb13f42469f53a3be59c4d48be4c08a
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS is_delete_marker boolean DEFAULT false NOT NULL;
-- END OPERATION 975fcadc251913e2dc511d91ee17db5ceeb13f42469f53a3be59c4d48be4c08a
