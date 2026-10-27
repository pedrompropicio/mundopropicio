-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.standalone_invoices.standalone_invoices_paid_by_partner_id_fkey
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "df70a4d3ba60ef23038d0c20eacf0220b5ae1e198dbc2fddc10b8067b9a3c6bf", "live_properties_sha256": "256ed4bbce74506e9cc1a598f4e0c834cded22c94065a4177032b1730d199c23", "oid": 227869, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "7d474f9421d3e1b72f5c25f14ce0fb37cd9ffe98dd3adbfebb66bb4c80b430e6", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 4b4f24bc0a8b7e2aa29b2dd5eb0b2b10015e8cba93071aac789dbacbd4fae8eb
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.standalone_invoices'::regclass AND conname='standalone_invoices_paid_by_partner_id_fkey') THEN
  ALTER TABLE public.standalone_invoices ADD CONSTRAINT standalone_invoices_paid_by_partner_id_fkey FOREIGN KEY (paid_by_partner_id) REFERENCES auth.users(id);
 END IF;
END $baseline_constraint$;
-- END OPERATION 4b4f24bc0a8b7e2aa29b2dd5eb0b2b10015e8cba93071aac789dbacbd4fae8eb
