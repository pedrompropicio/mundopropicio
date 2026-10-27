-- #352 G3: local disposable replay only. Never apply to Live.
-- object: triggers:public.events.trg_enforce_event_reopen_permission
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "b3c320c65fcc83176c7774095b5c2bf492de71f8179ab12734653664513f4c1f", "live_properties_sha256": "a9a69502d87d801ffc8627720dbdea6135ee1671df9c204be382587900ac9895", "oid": 223271, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "f600fda1f685b38517ef3d806b31c8c083fc45ed4c58d973da6ccf9fbe13b7b5", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 53d0106ecc437e59302588fefa376dfc1cadb3173b6aa12d9ab1c05a7a1ba722
CREATE OR REPLACE TRIGGER trg_enforce_event_reopen_permission BEFORE UPDATE OF status ON events FOR EACH ROW EXECUTE FUNCTION enforce_event_reopen_permission();

ALTER TABLE public.events ENABLE TRIGGER trg_enforce_event_reopen_permission;
-- END OPERATION 53d0106ecc437e59302588fefa376dfc1cadb3173b6aa12d9ab1c05a7a1ba722
