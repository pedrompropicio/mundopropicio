-- #352 G3: local disposable replay only. Never apply to Live.
-- object: triggers:crm.meta_publish_plan.trg_sync_publish_plan_campaign_id
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "877388cbc0143c6a7209e436fd053a81856654665d37565b4389a51635fabbe2", "live_properties_sha256": "37f5cb9970d4efc85161ea1f117c809ed8b9d17e44d0a05725603853d60617b2", "oid": 239809, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "ed913b6d8056d24405e4999af6e6c499439e9f7a6b73f2245452dcac34fa9917", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 84c9289cf9b0467f77a2ba19fcf08eb269fdb603d3fdaabb669bb89ae6e5fe53
CREATE OR REPLACE TRIGGER trg_sync_publish_plan_campaign_id BEFORE INSERT OR UPDATE ON crm.meta_publish_plan FOR EACH ROW EXECUTE FUNCTION crm.sync_publish_plan_campaign_id();

ALTER TABLE crm.meta_publish_plan ENABLE TRIGGER trg_sync_publish_plan_campaign_id;
-- END OPERATION 84c9289cf9b0467f77a2ba19fcf08eb269fdb603d3fdaabb669bb89ae6e5fe53
