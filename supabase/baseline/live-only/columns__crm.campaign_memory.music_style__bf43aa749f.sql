-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:crm.campaign_memory.music_style
-- stage: tail
-- provenance: {"attnum": 27, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "86fc52a71a1f27a5756fc2777189abf3c4170c49da22dfab59baa67051a1f547", "oid": 162680, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "a33321aa260d267be0878c9bf538ee57a7225cbeba2e9da35ff7f82286a617ed", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION faf6b4091d8ce6c0d9e44737d794d99ba3827966efb2e4db6d8800e357c5c1d1
ALTER TABLE crm.campaign_memory ADD COLUMN IF NOT EXISTS music_style text;
-- END OPERATION faf6b4091d8ce6c0d9e44737d794d99ba3827966efb2e4db6d8800e357c5c1d1
