-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.coala_unsub_token(pg_catalog.text)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 6a695f60b525652a22bcf966e6d37a5fd68c2ac504324b4fa6bd9c2d934a1560
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.coala_unsub_token(pg_catalog.text) FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.coala_unsub_token(pg_catalog.text) FROM "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.coala_unsub_token(pg_catalog.text) FROM "authenticated";
RESET ROLE;
-- END OPERATION 6a695f60b525652a22bcf966e6d37a5fd68c2ac504324b4fa6bd9c2d934a1560
