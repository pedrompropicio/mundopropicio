-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.song_links.song_id
-- stage: reconcile
-- provenance: {"attnum": 4, "live_absence": false, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "2f1844029e225cb427cc796d43e858f0cce7e30c4baa9a0652116bbafcd7b3ea", "review": 6445145238, "rule": "nullable_from_live", "source_sql_sha256": "dbb250ffbdb27008e65a927eafc412bfdb7fdbda8616dd5151e2c475a1e21092", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 2b9b39b63eae7c3e2e2ba7985dbe49662e3373e354ad2e79cd33933b778e8cd8
ALTER TABLE public.song_links ALTER COLUMN song_id DROP NOT NULL;
-- END OPERATION 2b9b39b63eae7c3e2e2ba7985dbe49662e3373e354ad2e79cd33933b778e8cd8
