-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:crm.meta_strategy_creatives.service_role_bypass
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "8c6dced9d486dc7ca36d38ca3d2175a507b2e6c17f6e6efe6d1bdf9f79c9f6ea", "oid": 81708, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "cc9ce2546f30298b08a9da6131dbf6faf3044ed038cad09c85b40d77892aa961", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION f7e4f6c6e6c0137d0f3bbb4c12351de3dc36c1cf4dfcd3b49a18eb169e566bf6
DROP POLICY IF EXISTS service_role_bypass ON crm.meta_strategy_creatives;

CREATE POLICY service_role_bypass ON crm.meta_strategy_creatives AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);
-- END OPERATION f7e4f6c6e6c0137d0f3bbb4c12351de3dc36c1cf4dfcd3b49a18eb169e566bf6
