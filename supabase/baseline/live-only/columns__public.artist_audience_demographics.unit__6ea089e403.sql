-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.artist_audience_demographics.unit
-- stage: tail
-- provenance: {"attnum": 13, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "f877da460c0fe8617bc891990ba3274313c624833b44e8710f05b58af45cc27c", "oid": 216423, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "65cc245190ca6ad2bf254244ce553002768df2d8f7cef33108a6e36dd09eb46a", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 10277ea5cfec136f7998d10ede23524cdcc43aedc5752db9f0a1ac4134362de3
ALTER TABLE public.artist_audience_demographics ADD COLUMN IF NOT EXISTS unit text DEFAULT 'count'::text NOT NULL;
-- END OPERATION 10277ea5cfec136f7998d10ede23524cdcc43aedc5752db9f0a1ac4134362de3
