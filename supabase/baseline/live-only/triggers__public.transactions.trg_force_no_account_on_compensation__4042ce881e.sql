-- #352 G3: local disposable replay only. Never apply to Live.
-- object: triggers:public.transactions.trg_force_no_account_on_compensation
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "a6af2496650afa221b1dd811156323336941088e742d84f0c5477491bc6f05b8", "live_properties_sha256": "f2ad4fa0a2f3d2aedab0e29bccedc6e4c33ae76f2bc4ac7cfc6d1268b5e2746f", "oid": 218282, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "ecd72740af6b21b77dc8c7e847baed53aeabb4166287a622cd69e405b644c58d", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 418853c5da8b457305c8de562ad5b4df5c4ebef47625cbc6433cd778310d1ecc
CREATE OR REPLACE TRIGGER trg_force_no_account_on_compensation BEFORE INSERT OR UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION force_no_account_on_compensation();

ALTER TABLE public.transactions ENABLE TRIGGER trg_force_no_account_on_compensation;
-- END OPERATION 418853c5da8b457305c8de562ad5b4df5c4ebef47625cbc6433cd778310d1ecc
