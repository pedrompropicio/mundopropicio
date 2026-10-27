-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.snapshot_bp_versions_to_trash()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 8354495ed97dc2404a9f6b6c39590302a3ba6bb9d4f9ddfdbe2425c440f9282e
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.snapshot_bp_versions_to_trash() FROM "authenticated";
RESET ROLE;
-- END OPERATION 8354495ed97dc2404a9f6b6c39590302a3ba6bb9d4f9ddfdbe2425c440f9282e
