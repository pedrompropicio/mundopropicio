-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.financial_accounts.advance_retention_pct
-- stage: historical
-- provenance: {"attnum": 22, "effective_at": "2026-09-07T12:08:52.999000Z", "live_catalog_sha256": "3ffa1626059c4029b45e589d6f98d3aeac1097e89e3731dc441fe63a612e83c9", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "961b35b9099c102a927e7ab29fcae9ecce8a18758badf3e31d58581288500eb4", "review": [6427891820, 6428334589], "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "70cde2c9bfcb614ae6f42440ed64bd1eb2377904e58b7319bcc3dbb4de442eff", "window": {"at": 1788782932999, "lower_version": "20260830193950", "upper_version": "oid_fk_208094"}}
-- BEGIN OPERATION b93de9b291100cb654156f4fd8180be9b897c3ac656d025d5b5f645e89862ce9
ALTER TABLE "public"."financial_accounts" ADD COLUMN IF NOT EXISTS "advance_retention_pct" numeric;
-- END OPERATION b93de9b291100cb654156f4fd8180be9b897c3ac656d025d5b5f645e89862ce9
