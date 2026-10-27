-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.set_combo_pass_company_id()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 13179791771e168cfb5ece8de7cbf9ffd9168a1da500c06643d2afb00b8d4cc6
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.set_combo_pass_company_id() FROM "authenticated";
RESET ROLE;
-- END OPERATION 13179791771e168cfb5ece8de7cbf9ffd9168a1da500c06643d2afb00b8d4cc6
