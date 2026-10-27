-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public._revert_event_to_version(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.bool)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 9394ec3baa0b8c03a7c2616981019ccad89923a79667308037d2ced03b110bc4
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public._revert_event_to_version(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.bool) FROM "authenticated";
RESET ROLE;
-- END OPERATION 9394ec3baa0b8c03a7c2616981019ccad89923a79667308037d2ced03b110bc4
