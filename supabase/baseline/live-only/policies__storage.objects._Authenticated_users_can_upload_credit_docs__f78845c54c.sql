-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:storage.objects."Authenticated users can upload credit docs"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "954a4b06e6f63db6575bb4a42ce52b5d96ec2e9359bfc73bcf0a460fecf53e64", "oid": 63708, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "cdfff77a0029863846c60607d3013c8ca50179ff1d173ddc7ee6303f6ed37c85", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 54b9a53412c6bac74e02092f3179c524bd86fc3e42902e775a2cfd8c53d7d265
DROP POLICY IF EXISTS "Authenticated users can upload credit docs" ON storage.objects;

CREATE POLICY "Authenticated users can upload credit docs" ON storage.objects AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((bucket_id = 'supplier-credit-documents'::text));
-- END OPERATION 54b9a53412c6bac74e02092f3179c524bd86fc3e42902e775a2cfd8c53d7d265
