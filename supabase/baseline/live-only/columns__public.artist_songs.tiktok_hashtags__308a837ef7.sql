-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.artist_songs.tiktok_hashtags
-- stage: tail
-- provenance: {"attnum": 19, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "15833dfe5a25101bfc25427910c90d8707569270a4358fe00a0b662aa102fac2", "oid": 218629, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "4486e08e236b6c518a0ecaffc568b81f467935d779c8c2f4ad2b16e5c05658cc", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 495b2a8e79b2283ae67ff6ffaceeed36a7667fb19f025b29c50bebbbe6ce6817
ALTER TABLE public.artist_songs ADD COLUMN IF NOT EXISTS tiktok_hashtags text[];
-- END OPERATION 495b2a8e79b2283ae67ff6ffaceeed36a7667fb19f025b29c50bebbbe6ce6817
