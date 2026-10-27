-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.tg_sponsorship_pipeline_autolog()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 96d154c661870dc19167c8837e8f4b56cf11fbd3251dfbc9208313f42be7bf67
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.tg_sponsorship_pipeline_autolog() FROM "authenticated";
RESET ROLE;
-- END OPERATION 96d154c661870dc19167c8837e8f4b56cf11fbd3251dfbc9208313f42be7bf67
