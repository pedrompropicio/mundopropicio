-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.read_email_batch(pg_catalog.text,pg_catalog.int4,pg_catalog.int4)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION ed5f1b8976dc8d69e1e49bb535e6c1cbda17d2f6e16feeb81b2d4496a544257c
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.read_email_batch(pg_catalog.text,pg_catalog.int4,pg_catalog.int4) FROM "authenticated";
RESET ROLE;
-- END OPERATION ed5f1b8976dc8d69e1e49bb535e6c1cbda17d2f6e16feeb81b2d4496a544257c
