-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.find_admin_absorbing_events(pg_catalog.date,pg_catalog.uuid)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION ad0079b76d39c22a57d0289e0da871a2f4a91bc2069363e20488e410893767fd
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.find_admin_absorbing_events(pg_catalog.date,pg_catalog.uuid) FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.find_admin_absorbing_events(pg_catalog.date,pg_catalog.uuid) FROM "anon";
RESET ROLE;

SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.find_admin_absorbing_events(pg_catalog.date,pg_catalog.uuid) FROM "authenticated";
RESET ROLE;
-- END OPERATION ad0079b76d39c22a57d0289e0da871a2f4a91bc2069363e20488e410893767fd
