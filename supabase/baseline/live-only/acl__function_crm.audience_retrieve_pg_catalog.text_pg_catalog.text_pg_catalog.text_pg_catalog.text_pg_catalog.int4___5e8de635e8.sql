-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:crm.audience_retrieve(pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.int4)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "8e542fdfc523e8fab1ecff0060273744deb9385f6899df8d558a7a40e54253d6", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION f87174c50dfbeec07ff916cb6d5b4f7c4042261cbd5bf96ab365d2d9bd3944d2
SET LOCAL ROLE "postgres";
GRANT EXECUTE ON FUNCTION crm.audience_retrieve(pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.int4) TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT EXECUTE ON FUNCTION crm.audience_retrieve(pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.text,pg_catalog.int4) TO "service_role";
RESET ROLE;
-- END OPERATION f87174c50dfbeec07ff916cb6d5b4f7c4042261cbd5bf96ab365d2d9bd3944d2
