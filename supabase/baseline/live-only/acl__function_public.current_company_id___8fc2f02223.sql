-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.current_company_id()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "9e4e25d748beac6525eab96678f96969c7751943b0b1e474e3bbab5f431cfcc7", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 4995e7bdd41ca99947e5ebd66cca2404dbd53fa8d3ed213b5eaa72315d3891cd
SET LOCAL ROLE "postgres";
GRANT EXECUTE ON FUNCTION public.current_company_id() TO PUBLIC;
RESET ROLE;
-- END OPERATION 4995e7bdd41ca99947e5ebd66cca2404dbd53fa8d3ed213b5eaa72315d3891cd
