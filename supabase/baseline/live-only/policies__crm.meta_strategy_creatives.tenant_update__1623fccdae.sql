-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:crm.meta_strategy_creatives.tenant_update
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "c45cbf9ac23cfaa84a370b3d75ba52311143c29d987305658a0c1b2709dbfab2", "oid": 81711, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "289d19ae3968cc6829e16867ae0b1331dd8864e09e876960a613bfa75ed1fa38", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION dc484539e573c3b0098a7d62c37e7cb43b6799387d0919c078647e4e66de13d9
DROP POLICY IF EXISTS tenant_update ON crm.meta_strategy_creatives;

CREATE POLICY tenant_update ON crm.meta_strategy_creatives AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));
-- END OPERATION dc484539e573c3b0098a7d62c37e7cb43b6799387d0919c078647e4e66de13d9
