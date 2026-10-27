-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:relation:crm.ads_publish_plan
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "56f4d5267787416d9eff511c3eb5b579f66ea62776081ccaec782ae80db60fe9", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION bc7797097cad64206417fab5b9975b9a94879a8287149b6f037337ec1fb17bec
SET LOCAL ROLE "postgres";
GRANT DELETE ON TABLE crm.ads_publish_plan TO "service_role";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT INSERT ON TABLE crm.ads_publish_plan TO "service_role";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT SELECT ON TABLE crm.ads_publish_plan TO "service_role";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT UPDATE ON TABLE crm.ads_publish_plan TO "service_role";
RESET ROLE;
-- END OPERATION bc7797097cad64206417fab5b9975b9a94879a8287149b6f037337ec1fb17bec
