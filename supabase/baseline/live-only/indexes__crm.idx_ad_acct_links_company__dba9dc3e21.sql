-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:crm.idx_ad_acct_links_company
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "72f64392309f4882a18df12d7b408e41303266ce9232c591bf2e03937f804a9a", "live_properties_sha256": "75e804fdb0cba02491c56522be87207d3747cd1bb422eb1380c17d4c9e6b3e08", "oid": 80320, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "f605c32459535f53ed804187f8cd339df4a532606dfde98b28b12b273fdacc15", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 3c6c8bac428a5412a91f4c86cde26b1acfd97fadad8d256ad6f91fdde4a30d42
CREATE INDEX IF NOT EXISTS idx_ad_acct_links_company ON crm.ad_platform_account_links USING btree (company_id, enabled);
-- END OPERATION 3c6c8bac428a5412a91f4c86cde26b1acfd97fadad8d256ad6f91fdde4a30d42
