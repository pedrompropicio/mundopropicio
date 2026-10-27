-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.song_links.song_links_link_type_check
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "cd4dde3498883a2f60b50a2216228c517db79d4e31439234196380524f9b9060", "live_properties_sha256": "4db5a412421eaa9e99339991cbba252b182283ec05da3f3eb364db4a23bc67d1", "oid": 374157, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "e225d3c77b4d1202b9759560384439acb63a6de67f9b7a9bc6b7c409225811db", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION c733774007012cf912aefaaff16d0156f42f1ab1bb1c234706c830fd7c122d7f
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.song_links'::regclass AND conname='song_links_link_type_check') THEN
  ALTER TABLE public.song_links ADD CONSTRAINT song_links_link_type_check CHECK (link_type = ANY (ARRAY['song'::text, 'playlist'::text]));
 END IF;
END $baseline_constraint$;
-- END OPERATION c733774007012cf912aefaaff16d0156f42f1ab1bb1c234706c830fd7c122d7f
