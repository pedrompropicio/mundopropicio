-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:crm.ads_hourly_validate_connection()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION bd8f6d3a5fa90e2041be7e804cf9a9f9a09eca918c7fc6b5244378acbaeb26a2
SET LOCAL ROLE "postgres";
GRANT EXECUTE ON FUNCTION crm.ads_hourly_validate_connection() TO "service_role";
RESET ROLE;
-- END OPERATION bd8f6d3a5fa90e2041be7e804cf9a9f9a09eca918c7fc6b5244378acbaeb26a2
