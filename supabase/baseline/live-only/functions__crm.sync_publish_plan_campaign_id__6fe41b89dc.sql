-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:crm.sync_publish_plan_campaign_id()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "c5846b0ca95a5386e8f5c9170cd9f85e77bb832aa0f9533e021bef4b1e319295", "live_properties_sha256": "5700337e5035e265d7e1fdf0e86c7bb7f96f5ee3f372fc76781ac51ff6a82a56", "oid": 239752, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "4c3e91a3e6e65c2b75370d28a924e3877afc8386366ae078383f08db7b5f3458", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 62e461f34f145bc61e2c0f13e4ad0696b5beb354407ad6fdca9431e035b41d87
CREATE OR REPLACE FUNCTION crm.sync_publish_plan_campaign_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'crm', 'public'
AS $function$
BEGIN
  IF NEW.meta_campaign_id IS DISTINCT FROM COALESCE(OLD.meta_campaign_id, NULL)
     AND NEW.meta_campaign_id IS NOT NULL THEN
    NEW.external_campaign_id := NEW.meta_campaign_id;
  ELSIF NEW.external_campaign_id IS DISTINCT FROM COALESCE(OLD.external_campaign_id, NULL)
     AND NEW.external_campaign_id IS NOT NULL AND NEW.platform = 'meta' THEN
    NEW.meta_campaign_id := NEW.external_campaign_id;
  END IF;
  RETURN NEW;
END $function$
;

ALTER FUNCTION crm.sync_publish_plan_campaign_id() OWNER TO "postgres";
-- END OPERATION 62e461f34f145bc61e2c0f13e4ad0696b5beb354407ad6fdca9431e035b41d87
