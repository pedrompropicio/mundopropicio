-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:crm.artist_ads_event_for_name(pg_catalog.uuid,pg_catalog.text)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "8e542fdfc523e8fab1ecff0060273744deb9385f6899df8d558a7a40e54253d6", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 1e434f0ce00f3feb1fcee9f85f63f83b01a0ae549fe8d80fbf48318284e25b10
SET LOCAL ROLE "postgres";
GRANT EXECUTE ON FUNCTION crm.artist_ads_event_for_name(pg_catalog.uuid,pg_catalog.text) TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "postgres";
GRANT EXECUTE ON FUNCTION crm.artist_ads_event_for_name(pg_catalog.uuid,pg_catalog.text) TO "service_role";
RESET ROLE;
-- END OPERATION 1e434f0ce00f3feb1fcee9f85f63f83b01a0ae549fe8d80fbf48318284e25b10
