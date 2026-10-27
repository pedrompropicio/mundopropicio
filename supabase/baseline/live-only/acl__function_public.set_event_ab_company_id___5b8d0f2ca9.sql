-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.set_event_ab_company_id()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 65602c1238122f5a08b5346b877f53b5a54311ff1cb6cfa28148163c4855ffb7
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.set_event_ab_company_id() FROM "authenticated";
RESET ROLE;
-- END OPERATION 65602c1238122f5a08b5346b877f53b5a54311ff1cb6cfa28148163c4855ffb7
