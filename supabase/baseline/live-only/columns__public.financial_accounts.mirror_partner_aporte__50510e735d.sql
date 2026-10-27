-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.financial_accounts.mirror_partner_aporte
-- stage: historical
-- provenance: {"attnum": 21, "effective_at": "2026-09-07T12:08:52.999000Z", "live_catalog_sha256": "b2889a0301464d278228c1811ce99f43e662cf19ae608cc4a2b9fff8d01f6abc", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "073b9d2a94eb595d31dd1d52f83955bfef16918376f0cbfffd44c002ea82ee26", "review": [6427891820, 6428334589], "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "70cde2c9bfcb614ae6f42440ed64bd1eb2377904e58b7319bcc3dbb4de442eff", "window": {"at": 1788782932999, "lower_version": "20260830193950", "upper_version": "oid_fk_208094"}}
-- BEGIN OPERATION 98f7229bde3927851761ea0c5071e1aafa7a9269b671b0483060bc6cfa3824dd
ALTER TABLE "public"."financial_accounts" ADD COLUMN IF NOT EXISTS "mirror_partner_aporte" boolean DEFAULT false NOT NULL;
-- END OPERATION 98f7229bde3927851761ea0c5071e1aafa7a9269b671b0483060bc6cfa3824dd
