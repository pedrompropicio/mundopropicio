-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.artist_audience_demographics.artist_audience_demographics_audience_type_check
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "8cdad6e6035003fa1abac1ee3fcca98fc34ee4f6a9ac27e07fbead9f6f94a720", "live_properties_sha256": "a8f34e3f2617d58b4e5af7f977b427409aa6f5105d7a2d37790ca79944870c31", "oid": 333777, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "51598975ad633ae86342c23a51b7cbbcbcb8117543bc4174dbdfb382db776737", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 6984a5179ce2b12b649900e2eb009154a053277f3c1d36ab851db47d74e87a1a
ALTER TABLE public.artist_audience_demographics DROP CONSTRAINT IF EXISTS artist_audience_demographics_audience_type_check;

DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.artist_audience_demographics'::regclass AND conname='artist_audience_demographics_audience_type_check') THEN
  ALTER TABLE public.artist_audience_demographics ADD CONSTRAINT artist_audience_demographics_audience_type_check CHECK (audience_type = ANY (ARRAY['followers'::text, 'engaged'::text, 'reached'::text, 'listeners'::text, 'streams'::text]));
 END IF;
END $baseline_constraint$;
-- END OPERATION 6984a5179ce2b12b649900e2eb009154a053277f3c1d36ab851db47d74e87a1a
