-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.consent_text_versions.consent_text_versions_channel_check
-- stage: historical
-- provenance: {"effective_at": "2026-10-26T12:29:58.685000Z", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "b951424db19b102c1683b17f420b5f1be1d493217b6289b8138c984350d85ea3", "live_properties_sha256": "26360c10c6f5070a33bdda2bbcbeeb2e524b13b984fd26081ea762f3a8846a97", "oid": 652340, "review": [6427891820, 6428334589], "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "b4ed988b8209614cba2c177d7f847aee888b750159127c152deec2d3090e6006", "window": {"at": 1793017798685, "lower_version": "drizzle_266", "upper_version": "drizzle_268"}}
-- BEGIN OPERATION 7b9ff06bf1c89268a6f4cf13a3d68d9b03227723e3dad1b1be73e021dfd48a1d
ALTER TABLE "public"."consent_text_versions" DROP CONSTRAINT IF EXISTS "consent_text_versions_channel_check";

DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."consent_text_versions"'::regclass AND conname='consent_text_versions_channel_check') THEN
  ALTER TABLE "public"."consent_text_versions" ADD CONSTRAINT "consent_text_versions_channel_check" CHECK (channel = ANY (ARRAY['email'::text, 'whatsapp'::text, 'ads'::text]));
 END IF;
END $baseline_constraint$;
-- END OPERATION 7b9ff06bf1c89268a6f4cf13a3d68d9b03227723e3dad1b1be73e021dfd48a1d
