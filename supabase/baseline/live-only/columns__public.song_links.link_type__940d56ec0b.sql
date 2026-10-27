-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.song_links.link_type
-- stage: tail
-- provenance: {"attnum": 18, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "b8bc4603173ce8af376cfc0314186d7cc39c4f595ad4657003bde77ab199a898", "oid": 262451, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "96eebc344c3708d0560836208307e4f5060f1f51fe61cf8df771141e7fb0fc96", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 99e50207c2d70a95c2827e89230c8d778657af70527c234ff029550eed1c204c
ALTER TABLE public.song_links ADD COLUMN IF NOT EXISTS link_type text DEFAULT 'song'::text NOT NULL;
-- END OPERATION 99e50207c2d70a95c2827e89230c8d778657af70527c234ff029550eed1c204c
