-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:crm.idx_ad_acct_links_conn
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "9fe0a700bfd3bb6eb105ffdee553e83eca46b2474f3d3565c53e46f6c6d111eb", "live_properties_sha256": "0be63b5dc55e1d2230e2f66f1c48050b67eecf3ed46d431a88703a5005c3f018", "oid": 80321, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "ef0fb475ac06fd7ceeef60f89848cb3d21c723cc8e523901febf7711b9925799", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION a9912b764f75921320359e9b0640296206c20f7f41b48c6c30febc72e2c05a17
CREATE INDEX IF NOT EXISTS idx_ad_acct_links_conn ON crm.ad_platform_account_links USING btree (connection_id, enabled);
-- END OPERATION a9912b764f75921320359e9b0640296206c20f7f41b48c6c30febc72e2c05a17
