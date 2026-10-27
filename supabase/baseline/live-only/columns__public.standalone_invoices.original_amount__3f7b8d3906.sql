-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.standalone_invoices.original_amount
-- stage: tail
-- provenance: {"attnum": 19, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "c0e1463d492a6297e5e8cae4dc61221adfbc94bb81e017cbceffb5c5fda32b9c", "oid": 178966, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "3d355dee9e0eabaa25c28a3533c1a594eadf43f8f82e868d4ef30e9f39ed919d", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION da5918f5d4b3d4a30ac84bd287a1434d9d2da84b47fd83ed8c2f281211d84bc1
ALTER TABLE public.standalone_invoices ADD COLUMN IF NOT EXISTS original_amount numeric;
-- END OPERATION da5918f5d4b3d4a30ac84bd287a1434d9d2da84b47fd83ed8c2f281211d84bc1
