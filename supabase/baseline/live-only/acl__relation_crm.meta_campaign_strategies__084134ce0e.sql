-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:relation:crm.meta_campaign_strategies
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "573f199f3b1d0d9be7eddc4a0cce71687a1c8093a3d166b7dae9d85a8dfe1e0a", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION ba8dc6ff3f63a4134733eb8b99dadebe8a23c556da41e75ff9e21448fc1c776f
SET LOCAL ROLE "postgres";
GRANT DELETE ON TABLE crm.meta_campaign_strategies TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT INSERT ON TABLE crm.meta_campaign_strategies TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT SELECT ON TABLE crm.meta_campaign_strategies TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT UPDATE ON TABLE crm.meta_campaign_strategies TO "authenticated";
RESET ROLE;
-- END OPERATION ba8dc6ff3f63a4134733eb8b99dadebe8a23c556da41e75ff9e21448fc1c776f
