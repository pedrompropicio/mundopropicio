-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.run_rls_isolation_test()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "a32260302883194975dca646a91c9b27e010558dd55d4c1d548679e683bdb721", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION b93082fe24d1bbaac3f860c7dbcd1e5fea76449955b21b50a7b98d55be2132b3
SET LOCAL ROLE "postgres";
GRANT EXECUTE ON FUNCTION public.run_rls_isolation_test() TO PUBLIC;
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT EXECUTE ON FUNCTION public.run_rls_isolation_test() TO "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT EXECUTE ON FUNCTION public.run_rls_isolation_test() TO "authenticated";
RESET ROLE;
-- END OPERATION b93082fe24d1bbaac3f860c7dbcd1e5fea76449955b21b50a7b98d55be2132b3
