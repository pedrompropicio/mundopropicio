-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:storage.objects."Cache extra docs viewable by authenticated"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "5be0baee57ce0567f5d53a83bd6b31238931b1642a6b8877fe03305e7cf3f581", "oid": 109898, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "9010a14f7d05d18e2fccb4f9b04b12f70afacccd3ce3d75ec00dcadd0bac084f", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION fc1cac28c4cdc14e394bd7da5f14820d53a8bd1e70d6a58133ababaa03ffdfee
DROP POLICY IF EXISTS "Cache extra docs viewable by authenticated" ON storage.objects;

CREATE POLICY "Cache extra docs viewable by authenticated" ON storage.objects AS PERMISSIVE FOR SELECT TO "authenticated" USING ((bucket_id = 'cache-extra-documents'::text));
-- END OPERATION fc1cac28c4cdc14e394bd7da5f14820d53a8bd1e70d6a58133ababaa03ffdfee
