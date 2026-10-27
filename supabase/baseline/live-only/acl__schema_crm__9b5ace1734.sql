-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:schema:crm
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "b52cd49bbd9c1221057a2d7e00e2dce4f6a293d70d99756ef7ba54bbb2f49f94", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 14eaa9a5d1558180b5b494f7c490e548cbb0dbed3667f3a84c2cd86a082cf761
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON SCHEMA crm FROM "anon";
RESET ROLE;
-- END OPERATION 14eaa9a5d1558180b5b494f7c490e548cbb0dbed3667f3a84c2cd86a082cf761
