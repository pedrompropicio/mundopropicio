-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.partner_capital_moves.flow
-- stage: tail
-- provenance: {"attnum": 9, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "606543ac38dc0c833d2014eb77ef8844038b19751919c35f9bd67e05b16d054b", "oid": 186494, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "26d818dff13b20b02fc93b5e6396964efce7388d51fb593a51df6959d8be395d", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 8d59fc7d6b48b9e75f3d81fa70bd3f51494bbd6a61e6ff0ab178d3cd9f21f3b6
ALTER TABLE public.partner_capital_moves ADD COLUMN IF NOT EXISTS flow text DEFAULT 'event_cash'::text NOT NULL;
-- END OPERATION 8d59fc7d6b48b9e75f3d81fa70bd3f51494bbd6a61e6ff0ab178d3cd9f21f3b6
