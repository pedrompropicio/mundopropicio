-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.vip_coupon_functions_base_url()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 755913f455b3d54cb4cc1855ae604644e093f5626f85b2b664af7b122261e5e0
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.vip_coupon_functions_base_url() FROM "authenticated";
RESET ROLE;
-- END OPERATION 755913f455b3d54cb4cc1855ae604644e093f5626f85b2b664af7b122261e5e0
