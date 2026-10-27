-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.song_link_events.capi_external_id
-- stage: historical
-- provenance: {"attnum": 30, "effective_at": "2026-10-10T16:19:26.402000Z", "live_catalog_sha256": "5a4bdc1d2d60f0a6bad5701a9178f7fa7f568f31ae12e2fe3f8b9df4bc9e59e2", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "bc14674be199111884366775a1326d91926c02a80e45fe4b8b499e5eb631d82e", "review": [6427891820, 6428334589], "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "09ed92b6dc4c96e18ca75ac278b3801493d66991851149342454483f2b275123", "window": {"at": 1791649166402, "lower_version": "20260924233339", "upper_version": "drizzle_81"}}
-- BEGIN OPERATION 5e93a4ce10a8faa380c647bdbed0e6c4ed9d2c603f16e5cdf43546e99cf8e1ce
ALTER TABLE "public"."song_link_events" ADD COLUMN IF NOT EXISTS "capi_external_id" boolean;
-- END OPERATION 5e93a4ce10a8faa380c647bdbed0e6c4ed9d2c603f16e5cdf43546e99cf8e1ce
