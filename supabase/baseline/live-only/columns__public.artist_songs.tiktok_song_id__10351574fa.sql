-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.artist_songs.tiktok_song_id
-- stage: tail
-- provenance: {"attnum": 20, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "62093bbd4b906598573aaed270b365964e5cf075a6e0a9dac577a4f6cabe98da", "oid": 218629, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "3902d0b352cef05c730c710ce829f81d18d4a2a5a507977ac5536f125ffebc05", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 29a2b5fdf45e24410bf9bb37139b5137c4c711052570370af554bd233ef46189
ALTER TABLE public.artist_songs ADD COLUMN IF NOT EXISTS tiktok_song_id text;
-- END OPERATION 29a2b5fdf45e24410bf9bb37139b5137c4c711052570370af554bd233ef46189
