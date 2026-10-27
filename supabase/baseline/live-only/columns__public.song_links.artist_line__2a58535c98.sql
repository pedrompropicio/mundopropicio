-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.song_links.artist_line
-- stage: tail
-- provenance: {"attnum": 16, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "17766ca7bdbcef08272cb9b9cd1c8667609788807299699a97eaac6b824560f7", "oid": 262451, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "9d4c7d3c7851f578f1ceec589cd18f135030c0e50cd9a05bfb7f3807719f64e5", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 161aa77c7b019002cfcb005ded4109d14ca10c35d12f16aeffab3fe9a30871ae
ALTER TABLE public.song_links ADD COLUMN IF NOT EXISTS artist_line text;
-- END OPERATION 161aa77c7b019002cfcb005ded4109d14ca10c35d12f16aeffab3fe9a30871ae
