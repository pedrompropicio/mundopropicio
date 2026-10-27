-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.issue335_balance_invariant_count()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 04542cd10cbc5948b23e57ec7f81edab99ea107adeae26d7425ec241107ad5f7
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.issue335_balance_invariant_count() FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.issue335_balance_invariant_count() FROM "authenticated";
RESET ROLE;
-- END OPERATION 04542cd10cbc5948b23e57ec7f81edab99ea107adeae26d7425ec241107ad5f7
