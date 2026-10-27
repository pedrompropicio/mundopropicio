-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:crm.idx_msc_strategy
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "a989ff60ee7da3ec2eb0161169deb1b91eff4af3e94c3cb93cadec73c18d4518", "live_properties_sha256": "1df71ac0045c6dbd7b8cb0b3207d26678100d0719ce06f189f7071989dd9bf02", "oid": 81705, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "44608bbbd6b3a4901e087ae9f9b6cc9e0a06323c1b524c72393a7da3392af2f9", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 40b506dd4ab7f655ecc978ee2575fa1d83904c36bc5cfcad99ccd616d60537b8
CREATE INDEX IF NOT EXISTS idx_msc_strategy ON crm.meta_strategy_creatives USING btree (strategy_id);
-- END OPERATION 40b506dd4ab7f655ecc978ee2575fa1d83904c36bc5cfcad99ccd616d60537b8
