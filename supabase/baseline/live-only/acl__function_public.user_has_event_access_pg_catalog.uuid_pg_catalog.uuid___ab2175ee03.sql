-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.user_has_event_access(pg_catalog.uuid,pg_catalog.uuid)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "a32260302883194975dca646a91c9b27e010558dd55d4c1d548679e683bdb721", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 62226ea5938b9d8f56553f2eb2c27313f97909c025fc06c24bbc89e1611f908c
SET LOCAL ROLE "postgres";
GRANT EXECUTE ON FUNCTION public.user_has_event_access(pg_catalog.uuid,pg_catalog.uuid) TO PUBLIC;
RESET ROLE;
-- END OPERATION 62226ea5938b9d8f56553f2eb2c27313f97909c025fc06c24bbc89e1611f908c
