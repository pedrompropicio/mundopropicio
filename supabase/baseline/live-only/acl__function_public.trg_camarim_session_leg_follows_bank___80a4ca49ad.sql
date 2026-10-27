-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.trg_camarim_session_leg_follows_bank()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 0ca73ca71e3c2f7f1f4a65fd179101ac2a6c32001fb6813a3fca5e08c0421c1e
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.trg_camarim_session_leg_follows_bank() FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.trg_camarim_session_leg_follows_bank() FROM "authenticated";
RESET ROLE;
-- END OPERATION 0ca73ca71e3c2f7f1f4a65fd179101ac2a6c32001fb6813a3fca5e08c0421c1e
