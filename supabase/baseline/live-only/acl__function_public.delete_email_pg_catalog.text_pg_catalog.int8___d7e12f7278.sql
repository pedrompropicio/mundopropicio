-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.delete_email(pg_catalog.text,pg_catalog.int8)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 348850695b723fb6cfc9a982ae2f02d5aa30f0e52d8f813b472046e275bae23c
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.delete_email(pg_catalog.text,pg_catalog.int8) FROM "authenticated";
RESET ROLE;
-- END OPERATION 348850695b723fb6cfc9a982ae2f02d5aa30f0e52d8f813b472046e275bae23c
