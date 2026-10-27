-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.financial_accounts.financial_accounts_partner_id_fkey
-- stage: historical
-- provenance: {"effective_at": "2026-09-07T12:08:53Z", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "815a7175d3131ad95d53dd89f4976d8d70c7a1c3bf1ea62e14015746a26fee26", "live_properties_sha256": "748bc3dad3c053a0873eeba071f8ed666b2813b3b39d185fafa18ad317f8eab9", "oid": 208094, "review": [6427891820, 6428334589], "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "146327509ecbbb2921f29c9b7c1ac0810e325d5260b3d10fb5bf92eb345be0f2", "window": {"at": 1788782933000, "lower_version": "20260907120852", "upper_version": "reconstructed_208099"}}
-- BEGIN OPERATION b7d1b96eb3f41dd72488db360c31966c900ca8b5cd31085e6e20b6b5d795838e
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."financial_accounts"'::regclass AND conname='financial_accounts_partner_id_fkey') THEN
  ALTER TABLE "public"."financial_accounts" ADD CONSTRAINT "financial_accounts_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES event_partners(id);
 END IF;
END $baseline_constraint$;
-- END OPERATION b7d1b96eb3f41dd72488db360c31966c900ca8b5cd31085e6e20b6b5d795838e
