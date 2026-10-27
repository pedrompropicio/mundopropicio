-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.move_to_dlq(pg_catalog.text,pg_catalog.text,pg_catalog.int8,pg_catalog.jsonb)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION b35ad6f165ec7fc218a18299ec079e8052ce17b5f9f4ac6a39d27ff59d01d51c
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.move_to_dlq(pg_catalog.text,pg_catalog.text,pg_catalog.int8,pg_catalog.jsonb) FROM "authenticated";
RESET ROLE;
-- END OPERATION b35ad6f165ec7fc218a18299ec079e8052ce17b5f9f4ac6a39d27ff59d01d51c
