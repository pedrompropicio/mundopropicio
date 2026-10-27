-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.song_links.song_links_artist_line_check
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "ee7d557119e0331563b6716184b8ff1bf957f399ca099e9d22f25574fb31cac9", "live_properties_sha256": "0652e5f5134735b3b6b368d7e410c15dcb4a73d5cc6a8db6628de95407f53d7e", "oid": 353888, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "29a89c4e7d459787e020388215536557d9256444c01e525f476f01e6483e2147", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION d4676d1342e04681145e1dc8cb6b7fb1cd4884398d76e36c590c7478673ceff8
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.song_links'::regclass AND conname='song_links_artist_line_check') THEN
  ALTER TABLE public.song_links ADD CONSTRAINT song_links_artist_line_check CHECK (artist_line IS NULL OR char_length(artist_line) <= 120);
 END IF;
END $baseline_constraint$;
-- END OPERATION d4676d1342e04681145e1dc8cb6b7fb1cd4884398d76e36c590c7478673ceff8
