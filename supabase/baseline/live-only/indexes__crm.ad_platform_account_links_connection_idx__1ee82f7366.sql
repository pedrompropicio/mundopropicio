-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:crm.ad_platform_account_links_connection_idx
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "f5e61b11a7b6ce40c2d0905eeb22e511762c299e88c7babdc15a674568a89b19", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "1d542b7f26a8caea1b82aaa4aa70e8e6b7a2dcaa7a77535403e8f95badac6fe7", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "056c882b9aed4f21762ff563bd3471bee79124325b3280f02c0bb6347b112e3f", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 6f60ccb62fd5d34ca6601a942f0657ebeb4db2c7ad143597c9dc5c12955cd35c
DROP INDEX IF EXISTS crm.ad_platform_account_links_connection_idx;
-- END OPERATION 6f60ccb62fd5d34ca6601a942f0657ebeb4db2c7ad143597c9dc5c12955cd35c
