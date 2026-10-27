-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.system_reminder_settings.default_twilio_from
-- stage: tail
-- provenance: {"attnum": 3, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "3ef1b54594cb71a75955e373452094cf7de3bb599468f1ae4c2aefa14f345f6b", "live_properties_sha256": "e5a913bfa123fe31dff1a273576b6236394729404cf64cdc7aba7e926440ba83", "oid": 60701, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "77ce91204b7ade3918719be80f816d8103c2aad5fdd40437f282c32a4b78ced0", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 179c017051ef7e45b070b21a96c3b6dbd24227b4d08c08838d1f953c00c659ec
ALTER TABLE public.system_reminder_settings ALTER COLUMN default_twilio_from SET DEFAULT '+000000000000'::text;
-- END OPERATION 179c017051ef7e45b070b21a96c3b6dbd24227b4d08c08838d1f953c00c659ec
