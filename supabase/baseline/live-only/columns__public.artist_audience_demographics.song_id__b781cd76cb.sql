-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.artist_audience_demographics.song_id
-- stage: historical
-- provenance: {"attnum": 14, "effective_at": "2026-10-05T17:29:52.412Z", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "293dc0d7eb3836cbf961eb308c9e2eadb82489f663651f82dd87d0cceb591887", "review": 6416673309, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "d98a035009292cd98d6b4fbf63f525e3eae37d57ac5fd0c2af4eb1b66a4c1bae", "window": {"effective_at": "2026-10-05T17:29:52.412Z", "first_reference_version": null, "lower": null, "upper": null}}
-- BEGIN OPERATION 3aca4f36586e70d9deabe02e519ea046913a472db4e2c90dc2b024c4c9fb5750
SET LOCAL search_path = public, extensions;

ALTER TABLE public.artist_audience_demographics ADD COLUMN IF NOT EXISTS song_id uuid;

DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.artist_audience_demographics'::regclass AND conname='artist_audience_demographics_song_id_fkey') THEN
  ALTER TABLE public.artist_audience_demographics ADD CONSTRAINT artist_audience_demographics_song_id_fkey FOREIGN KEY (song_id) REFERENCES artist_songs(id) ON DELETE CASCADE;
 END IF;
END $baseline_constraint$;

CREATE INDEX IF NOT EXISTS idx_aad_song ON public.artist_audience_demographics USING btree (song_id) WHERE (song_id IS NOT NULL);

ALTER TABLE public.artist_audience_demographics DROP CONSTRAINT IF EXISTS uq_artist_audience_demographics;

DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.artist_audience_demographics'::regclass AND conname='uq_artist_audience_demographics') THEN
  ALTER TABLE public.artist_audience_demographics ADD CONSTRAINT uq_artist_audience_demographics UNIQUE NULLS NOT DISTINCT (artist_id, platform, audience_type, dimension, dim_key, snapshot_date, song_id);
 END IF;
END $baseline_constraint$;
-- END OPERATION 3aca4f36586e70d9deabe02e519ea046913a472db4e2c90dc2b024c4c9fb5750
