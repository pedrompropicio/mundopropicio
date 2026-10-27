-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:function:public.reimbursement_revert_on_tx_delete()
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "ae8d45b9201cc86d978602fc84094d54139bd12ffc56d9b74933d6e40513a63e", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION b7a2c86b5c76afee2c1431bb72894a6ac37b2b2490f060937f893abbb9ace032
SET LOCAL ROLE "postgres";
REVOKE ALL PRIVILEGES ON FUNCTION public.reimbursement_revert_on_tx_delete() FROM "authenticated";
RESET ROLE;
-- END OPERATION b7a2c86b5c76afee2c1431bb72894a6ac37b2b2490f060937f893abbb9ace032
