-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.song_link_events.capi_fbp
-- stage: historical
-- provenance: {"attnum": 29, "effective_at": "2026-10-10T16:19:26.402000Z", "live_catalog_sha256": "91e343beaa7515af64f70841de817847632df4708749c22aabe224cfefb8bebf", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "101de726dde2002de836f802be83025f80c046c76fb02487b670b8d63aab7389", "review": [6427891820, 6428334589], "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "09ed92b6dc4c96e18ca75ac278b3801493d66991851149342454483f2b275123", "window": {"at": 1791649166402, "lower_version": "20260924233339", "upper_version": "drizzle_81"}}
-- BEGIN OPERATION 47ebe2ab33957593d8c8cd59252293fde66135ac9932a36195106a51fcf56f87
ALTER TABLE "public"."song_link_events" ADD COLUMN IF NOT EXISTS "capi_fbp" boolean;
-- END OPERATION 47ebe2ab33957593d8c8cd59252293fde66135ac9932a36195106a51fcf56f87
