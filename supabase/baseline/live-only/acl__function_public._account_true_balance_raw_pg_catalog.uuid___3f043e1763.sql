-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public._account_true_balance_raw(pg_catalog.uuid)
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 60d51234a6adac9cad1cc63c62ec1bdf01ca574d9d1e80d259e98934af87f87f
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public._account_true_balance_raw(pg_catalog.uuid) FROM "authenticated";
RESET ROLE;
-- END OPERATION 60d51234a6adac9cad1cc63c62ec1bdf01ca574d9d1e80d259e98934af87f87f
