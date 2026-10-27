-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:crm.meta_strategy_creatives.tenant_select
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "660cbd0cca8d5b4b77dd3821c16e18af617e07da1ce9c175ae17950a6889004c", "oid": 81709, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "4ddb6e224d72bcbc24e38a214141fc9dc60af0b8168d1a56e8e76df61519c2d1", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 115487537f561d2afc2a74839148d6118810075e70b60c5696b153065f0c52da
DROP POLICY IF EXISTS tenant_select ON crm.meta_strategy_creatives;

CREATE POLICY tenant_select ON crm.meta_strategy_creatives AS PERMISSIVE FOR SELECT TO "authenticated" USING ((company_id = current_company_id()));
-- END OPERATION 115487537f561d2afc2a74839148d6118810075e70b60c5696b153065f0c52da
