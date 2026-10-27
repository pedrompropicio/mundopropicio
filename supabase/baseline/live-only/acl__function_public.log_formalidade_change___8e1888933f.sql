-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.log_formalidade_change()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 0c545cead2fdaa961aadc6e80ca606230f04df7c23a914f05c9781e21ac24731
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.log_formalidade_change() FROM "authenticated";
RESET ROLE;
-- END OPERATION 0c545cead2fdaa961aadc6e80ca606230f04df7c23a914f05c9781e21ac24731
