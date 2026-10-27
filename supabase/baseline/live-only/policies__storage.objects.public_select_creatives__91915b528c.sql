-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:storage.objects.public_select_creatives
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "208871d0dcdb779d648160ea2f869043235886c5c9123c6a85fb7aa1dd4f9eae", "oid": 109980, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "2ccc562c7a1d56b6a987616d51faaf5628972e8ae3c3d531434dcb2ad923f49d", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 76a71618434ef3172d6e9527a3f9b01b902fe3f6d3d623e61f8bb5603b7b2c92
DROP POLICY IF EXISTS public_select_creatives ON storage.objects;

CREATE POLICY public_select_creatives ON storage.objects AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((bucket_id = 'crm-meta-creatives'::text));
-- END OPERATION 76a71618434ef3172d6e9527a3f9b01b902fe3f6d3d623e61f8bb5603b7b2c92
