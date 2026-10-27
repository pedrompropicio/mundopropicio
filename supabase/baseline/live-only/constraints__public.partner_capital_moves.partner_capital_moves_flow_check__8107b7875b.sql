-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.partner_capital_moves.partner_capital_moves_flow_check
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "b8e13e8a4e90b50a5ea0104293489fd2384cc42fd1d98e54177cd27bf11929e1", "live_properties_sha256": "e137a331d9f584a649a00ac5637590a1155716e3e020906cfbc9122b3feadea1", "oid": 195652, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "8d10efb1b973d29cc414ce78a5c7203ede76b4f85dcf219e67c7c00198bd79bb", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 05197b1719f8a7c9fc2a339a67c1d87076e72974ddd51e89c00e2032cddaea36
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.partner_capital_moves'::regclass AND conname='partner_capital_moves_flow_check') THEN
  ALTER TABLE public.partner_capital_moves ADD CONSTRAINT partner_capital_moves_flow_check CHECK (flow = ANY (ARRAY['event_cash'::text, 'partner_settlement'::text]));
 END IF;
END $baseline_constraint$;
-- END OPERATION 05197b1719f8a7c9fc2a339a67c1d87076e72974ddd51e89c00e2032cddaea36
