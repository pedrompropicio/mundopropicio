-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.artist_audience_demographics.artist_audience_demographics_unit_check
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "64568902ef7f304deb2562ff976439b25ac110b7b70f2027b8f19f029c7330c0", "live_properties_sha256": "046f7d1165987f2813e091112f0d35871a30fbc20cded8a92e2feebb8bd0168e", "oid": 246313, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "0df5139b15ea6ab56b1627d3e1561e91e6d38059330bf0828228b297cdb92ad9", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 9b7becd5e660210a3b24ad2737aa4f47318727f55b97c99af78a1ed63f3b514c
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.artist_audience_demographics'::regclass AND conname='artist_audience_demographics_unit_check') THEN
  ALTER TABLE public.artist_audience_demographics ADD CONSTRAINT artist_audience_demographics_unit_check CHECK (unit = ANY (ARRAY['count'::text, 'pct'::text]));
 END IF;
END $baseline_constraint$;
-- END OPERATION 9b7becd5e660210a3b24ad2737aa4f47318727f55b97c99af78a1ed63f3b514c
