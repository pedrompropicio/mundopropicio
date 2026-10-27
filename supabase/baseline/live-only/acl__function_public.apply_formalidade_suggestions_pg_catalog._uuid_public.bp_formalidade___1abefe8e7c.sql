-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.apply_formalidade_suggestions(pg_catalog._uuid,public.bp_formalidade)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION bfe1c11dc82a885c1057f696d48a17305e80fd161d99a787f3a43b22ea59f536
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.apply_formalidade_suggestions(pg_catalog._uuid,public.bp_formalidade) FROM "authenticated";
RESET ROLE;
-- END OPERATION bfe1c11dc82a885c1057f696d48a17305e80fd161d99a787f3a43b22ea59f536
