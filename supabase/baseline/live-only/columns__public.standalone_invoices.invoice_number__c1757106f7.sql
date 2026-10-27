-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.standalone_invoices.invoice_number
-- stage: tail
-- provenance: {"attnum": 17, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "79a14af2abacc5bb148f23bf6791d4dcc1cb7b402c981be06910dc7e0e98a367", "oid": 178966, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "acaaa4dfa1f103590843cdf4dbbfd1ecd19d54c00a04da75e7683103efab9b73", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 3681b42753ec99a69454e89afff587e9e4d8e44a1258a2be1aaa39bb0ec1dbdd
ALTER TABLE public.standalone_invoices ADD COLUMN IF NOT EXISTS invoice_number text;
-- END OPERATION 3681b42753ec99a69454e89afff587e9e4d8e44a1258a2be1aaa39bb0ec1dbdd
