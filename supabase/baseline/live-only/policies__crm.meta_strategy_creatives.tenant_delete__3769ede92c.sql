-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:crm.meta_strategy_creatives.tenant_delete
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "5c6364c9afb5593cbb50145ae35010e1ca4b222acf80bd3895d232695ba17868", "oid": 81712, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "3383b8ef38f854b5bb4a1d2a19866b64401d8344dcabe241c3c3a15af11826e2", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION c9adc3b199b09cacba624d4b11c59e67f55b5ec2ebc5986767929f520b8b7ba0
DROP POLICY IF EXISTS tenant_delete ON crm.meta_strategy_creatives;

CREATE POLICY tenant_delete ON crm.meta_strategy_creatives AS PERMISSIVE FOR DELETE TO "authenticated" USING ((company_id = current_company_id()));
-- END OPERATION c9adc3b199b09cacba624d4b11c59e67f55b5ec2ebc5986767929f520b8b7ba0
