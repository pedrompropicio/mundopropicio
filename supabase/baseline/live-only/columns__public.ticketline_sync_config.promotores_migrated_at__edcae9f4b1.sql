-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.ticketline_sync_config.promotores_migrated_at
-- stage: tail
-- provenance: {"attnum": 15, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "b893c5b1cc24b48f48a5333a2d21c189f0ece9d2c763fe32720a8a52aefb28f4", "oid": 113803, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "429b95eb7a85d283e563e5eac4e4bc0446e28e0cd1c29ec055b46434e675df70", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 1f7361819a8959b41979f581a67086475042e3fa249e7e780b24311e7bc8cfc2
ALTER TABLE public.ticketline_sync_config ADD COLUMN IF NOT EXISTS promotores_migrated_at timestamp with time zone;
-- END OPERATION 1f7361819a8959b41979f581a67086475042e3fa249e7e780b24311e7bc8cfc2
