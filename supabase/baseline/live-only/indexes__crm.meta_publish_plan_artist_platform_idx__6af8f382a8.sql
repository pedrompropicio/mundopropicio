-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:crm.meta_publish_plan_artist_platform_idx
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "9ccd1fd7eac553d190ae900b1b3f63ee68a8cd4dc2aba1b3478b73c3dd973147", "live_properties_sha256": "f7ce0ec42b5dc6abceb18f05dadf7e12946b70ed7057286ed31f723749bb7e8d", "oid": 239754, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "8db8b0921604bf148fd2ea2997c1f545761a769e97755755449798d1f5172bfa", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION ee506cc991b061c2e0a767eae6980deea8895097b05767459b6bf67b9d677799
CREATE INDEX IF NOT EXISTS meta_publish_plan_artist_platform_idx ON crm.meta_publish_plan USING btree (artist_id, platform, created_at DESC) WHERE (song_id IS NOT NULL);
-- END OPERATION ee506cc991b061c2e0a767eae6980deea8895097b05767459b6bf67b9d677799
