-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.ticketline_sync_config.ticketline_cutoff_requires_migrated
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "6d92490fbea5552e2ceb4fc217cfd95dbc9f67563a93b9e50fef870e4efc99d8", "live_properties_sha256": "448d3254e48722cc8083a4a28e1caa3eccd20217b06a31d22544fb76279f5df1", "oid": 270445, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "ee1fd02d96fe8510681fe9e2630361d124e8fe245617790454872aec2156cfcd", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 23ef2365c8dd8f81a07713757e623de14c1c7bf1a7a9fa9d11c4f812071afc52
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.ticketline_sync_config'::regclass AND conname='ticketline_cutoff_requires_migrated') THEN
  ALTER TABLE public.ticketline_sync_config ADD CONSTRAINT ticketline_cutoff_requires_migrated CHECK (promotores_cutoff_date IS NULL OR promotores_migrated_at IS NOT NULL);
 END IF;
END $baseline_constraint$;
-- END OPERATION 23ef2365c8dd8f81a07713757e623de14c1c7bf1a7a9fa9d11c4f812071afc52
