-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.ticketline_sync_config.promotores_cutoff_date
-- stage: tail
-- provenance: {"attnum": 16, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "688a67578254dc53b2f0fa6d485b55cb80c30f1d1861af33d5d019b17a8f4e89", "oid": 113803, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "c9d14d97c432ac658a42f5e50517574a31afe21733c3787453acc7df8cc96f9e", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION b356f2aa6cc07cb05fb401fa91f55a1bba348d7f9ffb40fa95d1363894d8365e
ALTER TABLE public.ticketline_sync_config ADD COLUMN IF NOT EXISTS promotores_cutoff_date date;
-- END OPERATION b356f2aa6cc07cb05fb401fa91f55a1bba348d7f9ffb40fa95d1363894d8365e
