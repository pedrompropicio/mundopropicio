-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.standalone_invoices.fx_rate
-- stage: tail
-- provenance: {"attnum": 20, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "00550fd7ecae5c718fc77e16d6aa8296943b38114c6b9b6d25f5c44909d73424", "oid": 178966, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "4003d83403f7e46b0607b5b1a9e1460feebaecf5768458e28b4f5226cde30737", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION f81ba00d574ded1fcfefa5882e6472dc7864e14272acb55dbba7e9a93597d5af
ALTER TABLE public.standalone_invoices ADD COLUMN IF NOT EXISTS fx_rate numeric;
-- END OPERATION f81ba00d574ded1fcfefa5882e6472dc7864e14272acb55dbba7e9a93597d5af
