-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.song_link_events.capi_fbc
-- stage: historical
-- provenance: {"attnum": 28, "effective_at": "2026-10-10T16:19:26.402000Z", "live_catalog_sha256": "69e8db91f58c35cd8a0c5a37e90c2daa5c864129010f2ada9770ea038059e159", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "69a91fdb9d335762acd9a54de553f2e44e0404f66b18d0d10ad4add21df2c809", "review": [6427891820, 6428334589], "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "09ed92b6dc4c96e18ca75ac278b3801493d66991851149342454483f2b275123", "window": {"at": 1791649166402, "lower_version": "20260924233339", "upper_version": "drizzle_81"}}
-- BEGIN OPERATION d81eff98b069ae70c53419f3107f53b87f8eba0b24ef8a98d74e9e57ecb198c1
ALTER TABLE "public"."song_link_events" ADD COLUMN IF NOT EXISTS "capi_fbc" boolean;
-- END OPERATION d81eff98b069ae70c53419f3107f53b87f8eba0b24ef8a98d74e9e57ecb198c1
