-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.rederive_paid_amount_on_amount_change()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION df8f70eaa54fe5d411b3a460f71b9f51de9963d0ed786fe319158d69bf6c75b9
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.rederive_paid_amount_on_amount_change() FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.rederive_paid_amount_on_amount_change() FROM "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.rederive_paid_amount_on_amount_change() FROM "authenticated";
RESET ROLE;
-- END OPERATION df8f70eaa54fe5d411b3a460f71b9f51de9963d0ed786fe319158d69bf6c75b9
