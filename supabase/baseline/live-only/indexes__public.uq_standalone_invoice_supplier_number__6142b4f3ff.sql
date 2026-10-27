-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:public.uq_standalone_invoice_supplier_number
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "23c170b7172df177163f83bc72546e30346eaaa1a65f509a733917f6a2ae763c", "live_properties_sha256": "acfd86c7f61938cbd3c843b2aa9ab1ec689f1b48d966fed7ca88431820228ad9", "oid": 227874, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "b9abda36592c42d862d0ae9508d3ad23f2b75fb4bb9c4df0bd870eea2a5aa295", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 468e5420bd46735aec2fc0fb695b305f6c4d5070e894f7628bc95bc032f565bd
CREATE UNIQUE INDEX IF NOT EXISTS uq_standalone_invoice_supplier_number ON public.standalone_invoices USING btree (company_id, supplier_nif, invoice_number) WHERE ((supplier_nif IS NOT NULL) AND (invoice_number IS NOT NULL));
-- END OPERATION 468e5420bd46735aec2fc0fb695b305f6c4d5070e894f7628bc95bc032f565bd
