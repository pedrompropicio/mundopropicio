-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.ticketline_sync_config.ticketline_report_codes
-- stage: tail
-- provenance: {"attnum": 14, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "e5549bab3d9fba88ca39f807be54d36a3e7bcaa71bbe51842d9ceacfb9c8ef4e", "oid": 113803, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "a36c69173fda2bbf19b6db754104fc7495839176120d3b2df0a737b107d9cdc9", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION f6ff2c2bf037d4ba97f3bc553452cfe7dc5502b376731ed2dcf3a00906c42ea4
ALTER TABLE public.ticketline_sync_config ADD COLUMN IF NOT EXISTS ticketline_report_codes text;
-- END OPERATION f6ff2c2bf037d4ba97f3bc553452cfe7dc5502b376731ed2dcf3a00906c42ea4
