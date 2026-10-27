-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:crm.sync_publish_plan_campaign_id()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "8e542fdfc523e8fab1ecff0060273744deb9385f6899df8d558a7a40e54253d6", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 0ba4353364d60b1c3e42460e1d7de74a3bbb965a79e9c99ddb0e836bf4bfaa77
SET LOCAL ROLE "postgres";
GRANT EXECUTE ON FUNCTION crm.sync_publish_plan_campaign_id() TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT EXECUTE ON FUNCTION crm.sync_publish_plan_campaign_id() TO "service_role";
RESET ROLE;
-- END OPERATION 0ba4353364d60b1c3e42460e1d7de74a3bbb965a79e9c99ddb0e836bf4bfaa77
