-- #352 G3: local disposable replay only. Never apply to Live.
-- object: triggers:public.transactions.zz_rederive_paid_amount_on_amount_change
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "b99fcefee68906128c4d9c49cded453faf8274253f1e6451132900ad3a066685", "live_properties_sha256": "730bd7166eeaa588ea4d8fda47deb6d116992c2f1a2ea940a38fa6315bca8740", "oid": 361279, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "078a5d167c57333fb9d8abe0bd9ec79eef67d3cad6c4487145e2030a7fd5e9be", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION cf505f4bf95ae723034db1837a3d7c051dfead728a8026ceb05043c3b0a75836
CREATE OR REPLACE TRIGGER zz_rederive_paid_amount_on_amount_change AFTER UPDATE OF amount, iva_rate ON transactions FOR EACH ROW EXECUTE FUNCTION rederive_paid_amount_on_amount_change();

ALTER TABLE public.transactions ENABLE TRIGGER zz_rederive_paid_amount_on_amount_change;
-- END OPERATION cf505f4bf95ae723034db1837a3d7c051dfead728a8026ceb05043c3b0a75836
