-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:storage.objects."Authenticated users can view credit docs"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "7770dd40db4070eff9b4cb6738b0bd09d4a3129d65a74f94c5dbada72dd5ca13", "oid": 109889, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "91c60976cfd872af17b81ffdefb5883095029dbc04646e32848207bb9d810297", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION b32456e55592b36cd516a5aad8f2a6aa7e536ecd5da8fe917941172342402d79
DROP POLICY IF EXISTS "Authenticated users can view credit docs" ON storage.objects;

CREATE POLICY "Authenticated users can view credit docs" ON storage.objects AS PERMISSIVE FOR SELECT TO "authenticated" USING ((bucket_id = 'supplier-credit-documents'::text));
-- END OPERATION b32456e55592b36cd516a5aad8f2a6aa7e536ecd5da8fe917941172342402d79
