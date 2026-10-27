-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.enqueue_email(pg_catalog.text,pg_catalog.jsonb)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 02b9e609655aa81c7187edfb503fe36e7da7be5eff53f160968ab36665e54144
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.enqueue_email(pg_catalog.text,pg_catalog.jsonb) FROM "authenticated";
RESET ROLE;
-- END OPERATION 02b9e609655aa81c7187edfb503fe36e7da7be5eff53f160968ab36665e54144
