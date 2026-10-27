-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public._account_true_balance_asof_raw(pg_catalog.uuid,pg_catalog.date)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION b99a50638545cbc95d538aaec24c3ca59ebe55f9fb1eef42907f2eca16c726d5
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public._account_true_balance_asof_raw(pg_catalog.uuid,pg_catalog.date) FROM "authenticated";
RESET ROLE;
-- END OPERATION b99a50638545cbc95d538aaec24c3ca59ebe55f9fb1eef42907f2eca16c726d5
