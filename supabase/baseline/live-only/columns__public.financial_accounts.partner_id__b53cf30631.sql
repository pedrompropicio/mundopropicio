-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.financial_accounts.partner_id
-- stage: historical
-- provenance: {"attnum": 20, "effective_at": "2026-09-07T12:08:52.999000Z", "live_catalog_sha256": "a9a1fb854ea7adf401f1e7702fcf004b254fa1f06dee61a411b7f8f84e7743c2", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "a22226b750a3158a0cc18b5be7c61186d3e657360a6ac84abbfa548e1c95881a", "review": [6427891820, 6428334589], "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "70cde2c9bfcb614ae6f42440ed64bd1eb2377904e58b7319bcc3dbb4de442eff", "window": {"at": 1788782932999, "lower_version": "20260830193950", "upper_version": "oid_fk_208094"}}
-- BEGIN OPERATION ae996613c6d7bc213ad92ebec63c708e58d365996795868a05e7d3d6e09bf617
ALTER TABLE "public"."financial_accounts" ADD COLUMN IF NOT EXISTS "partner_id" uuid;
-- END OPERATION ae996613c6d7bc213ad92ebec63c708e58d365996795868a05e7d3d6e09bf617
