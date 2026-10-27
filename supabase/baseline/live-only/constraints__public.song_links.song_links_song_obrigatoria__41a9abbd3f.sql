-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.song_links.song_links_song_obrigatoria
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "b7bbbf1f0280cb956f64323e2c8e46fb89d69ade40c7e8bc1aeff03825bb0300", "live_properties_sha256": "41dfc58fbe3c426f1ad4d16187d668e06069ea9fd09b98a4ea1f92edaec37c0a", "oid": 374158, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "1d1513115bd2fb5e1394bd7f11b1dfd8578aa2848b24c65e8d7959f863a5b246", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 1409a9a841a7164e4fb998f213608526ffb8a8661a5eaa87f089e49d2e9da87e
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.song_links'::regclass AND conname='song_links_song_obrigatoria') THEN
  ALTER TABLE public.song_links ADD CONSTRAINT song_links_song_obrigatoria CHECK (link_type <> 'song'::text OR song_id IS NOT NULL);
 END IF;
END $baseline_constraint$;
-- END OPERATION 1409a9a841a7164e4fb998f213608526ffb8a8661a5eaa87f089e49d2e9da87e
