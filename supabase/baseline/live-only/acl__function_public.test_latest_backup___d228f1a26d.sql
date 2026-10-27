-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.test_latest_backup()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION ef15acb50ff515c7468a3a19d53b1e496acfeb8d6d99a773ba057daf0b360e6e
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.test_latest_backup() FROM "authenticated";
RESET ROLE;
-- END OPERATION ef15acb50ff515c7468a3a19d53b1e496acfeb8d6d99a773ba057daf0b360e6e
