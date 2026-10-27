-- #352 G3: local disposable replay only. Never apply to Live.
-- object: triggers:public.transactions.trg_sync_partner_aporte_mirror
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "0a266ea291cabac3919e53f7d00994516caa9245e6bdf99695fcdb18752f669c", "live_properties_sha256": "5fd554f5ca70c92dc557d30057570d8ed6ee00a8d4f06bd6b103f5363bd2b338", "oid": 208135, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "0d78080310b8727e8df4f05b9b73b3676b06f27f7abd0162f15d849336281246", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION a486b2214c8a7920e0677478180a64a6409d7fe65a02b5b832b82f2c80e7bc3c
CREATE OR REPLACE TRIGGER trg_sync_partner_aporte_mirror AFTER INSERT OR UPDATE OF paid_amount, account_id, status, payment_date, reversed_at, description ON transactions FOR EACH ROW EXECUTE FUNCTION sync_partner_aporte_mirror();

ALTER TABLE public.transactions ENABLE TRIGGER trg_sync_partner_aporte_mirror;
-- END OPERATION a486b2214c8a7920e0677478180a64a6409d7fe65a02b5b832b82f2c80e7bc3c
