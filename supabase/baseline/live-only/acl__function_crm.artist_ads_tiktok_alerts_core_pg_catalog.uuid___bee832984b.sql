-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:crm.artist_ads_tiktok_alerts_core(pg_catalog.uuid)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 5fa53a60ce4cbd51d19a473851276c1a552ac674c81cfdef571905af11d86666
SET LOCAL ROLE "postgres";
GRANT EXECUTE ON FUNCTION crm.artist_ads_tiktok_alerts_core(pg_catalog.uuid) TO "service_role";
RESET ROLE;
-- END OPERATION 5fa53a60ce4cbd51d19a473851276c1a552ac674c81cfdef571905af11d86666
