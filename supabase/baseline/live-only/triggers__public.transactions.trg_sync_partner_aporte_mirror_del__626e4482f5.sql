-- #352 G3: local disposable replay only. Never apply to Live.
-- object: triggers:public.transactions.trg_sync_partner_aporte_mirror_del
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "64921979da2c8cfb64b47846a76dd4d2da051c3395364e9fa92c6359dd739ebf", "live_properties_sha256": "58e6013fcf2d91e9ce431f0ef5a6f566f3eb8884b842160419c3093d0aea696a", "oid": 208136, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "f0a3b8a3673cfd1e124bed87b1918e8ccaa84be6ad2c7331f06edd6ea9e3ce16", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 6fb1623c00bb295d4fcdffc5e5b195cf96132c8654630f6ecf2250c8894a2c37
CREATE OR REPLACE TRIGGER trg_sync_partner_aporte_mirror_del BEFORE DELETE ON transactions FOR EACH ROW EXECUTE FUNCTION sync_partner_aporte_mirror();

ALTER TABLE public.transactions ENABLE TRIGGER trg_sync_partner_aporte_mirror_del;
-- END OPERATION 6fb1623c00bb295d4fcdffc5e5b195cf96132c8654630f6ecf2250c8894a2c37
