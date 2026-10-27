-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.event_forecasts.ordering_partner_id
-- stage: historical
-- provenance: {"attnum": 36, "effective_at": "2026-08-25T12:44:00Z", "live_catalog_sha256": "1aa87cdc42cb6d5af442761e21a5bbfda27aceca6ca1c31cc854578f9a9b71e3", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "df75534c97e8aaf8e95ba686926268dd71f9cd9460eb919a6b07a84874ce7cac", "oid": 17845, "review": {"historical_authorization": "Pedro/Claude #352 current session 26/10/2026: event_forecasts ordering_partner_id and paying_partner_id, same SELECT-only reconstructed-column rule", "promotion": 6449906971}, "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "86612ad2f9cef70c9f75379200de3ced0314135ed69f2012aa90b98fcfbbf7a7", "window": {"effective_at": "2026-08-25T12:44:00Z", "first_reference_version": null, "lower": {"reason": "ledger sibling functionality on public.transactions; authorised lower bound", "source_sha256": "46965b47c0dc14b94114771909e2860045c13f1c721929035014b558a5d88988", "utc": "2026-08-25T12:43:56Z", "version": "20260825124356"}, "upper": {"reason": "first plan reference to paying_partner_id on public.event_forecasts, L11-16", "source_sha256": "cecc876039104b970c03e49a1ef3033f368b2aafbf06f8c4e6f8385164efc805", "utc": "2026-08-25T13:36:47Z", "version": "20260825133647"}}}
-- BEGIN OPERATION 158da76dbdf6c031f303c26b2799679d116337d90bbae9ba9eabb142e31b71e8
SET LOCAL search_path = public, extensions;

ALTER TABLE "public"."event_forecasts" ADD COLUMN IF NOT EXISTS "ordering_partner_id" uuid;

DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"public"."event_forecasts"'::regclass AND conname='event_forecasts_ordering_partner_id_fkey') THEN
  ALTER TABLE "public"."event_forecasts" ADD CONSTRAINT "event_forecasts_ordering_partner_id_fkey" FOREIGN KEY (ordering_partner_id) REFERENCES event_partners(id) ON DELETE SET NULL;
 END IF;
END $baseline_constraint$;

CREATE INDEX IF NOT EXISTS idx_event_forecasts_ordering_partner ON public.event_forecasts USING btree (ordering_partner_id) WHERE (ordering_partner_id IS NOT NULL);
-- END OPERATION 158da76dbdf6c031f303c26b2799679d116337d90bbae9ba9eabb142e31b71e8
