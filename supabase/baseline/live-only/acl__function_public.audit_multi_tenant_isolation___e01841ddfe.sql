-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.audit_multi_tenant_isolation()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 0caf6a2c66b409386c82079f78b1f9c2a4bc65d0a682526913767fc62ab8c627
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.audit_multi_tenant_isolation() FROM "authenticated";
RESET ROLE;
-- END OPERATION 0caf6a2c66b409386c82079f78b1f9c2a4bc65d0a682526913767fc62ab8c627
