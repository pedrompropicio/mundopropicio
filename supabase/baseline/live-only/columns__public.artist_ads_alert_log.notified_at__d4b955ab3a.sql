-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.artist_ads_alert_log.notified_at
-- stage: historical
-- provenance: {"attnum": 13, "effective_at": "2026-10-13T18:26:47.764000Z", "live_catalog_sha256": "4b5d0348da053b4f3ec801dd202c2ceba4d1d4ea67d9dbb7e5226c72b11d41cb", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "5996b1860f1cf92c4508fd1eaa44c02ca41e5dd5b9a3f425409d814e471b6d64", "review": [6427891820, 6428334589], "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "14686e466002acb7f77e3fced61a50c76ca5a328e422eab05f830a55dc274b2d", "window": {"at": 1791916007764, "lower_version": "drizzle_21", "upper_version": "drizzle_139"}}
-- BEGIN OPERATION c50d722c55e93e274f771e9c9e2ed048e79f18984cae98a4e5867f3a8820b1b7
ALTER TABLE "public"."artist_ads_alert_log" ADD COLUMN IF NOT EXISTS "notified_at" timestamp with time zone;
-- END OPERATION c50d722c55e93e274f771e9c9e2ed048e79f18984cae98a4e5867f3a8820b1b7
