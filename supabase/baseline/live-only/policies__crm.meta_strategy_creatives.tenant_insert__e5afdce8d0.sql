-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:crm.meta_strategy_creatives.tenant_insert
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "dc99811e75063d70caa948bc49a627d38cb3946fa3b75d310509d00719c1670d", "oid": 81710, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "db434d46d0a9b6d9b6969ab0b3dac65777e9a2a16f9d460db974f05ac6127ed1", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 93ee2d96da518b34428fa01b8c5b2c2cb2bb881d037a9cf69176fba82d6f1bba
DROP POLICY IF EXISTS tenant_insert ON crm.meta_strategy_creatives;

CREATE POLICY tenant_insert ON crm.meta_strategy_creatives AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((company_id = current_company_id()));
-- END OPERATION 93ee2d96da518b34428fa01b8c5b2c2cb2bb881d037a9cf69176fba82d6f1bba
