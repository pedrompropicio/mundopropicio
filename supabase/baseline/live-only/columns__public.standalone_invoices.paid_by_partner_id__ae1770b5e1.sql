-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.standalone_invoices.paid_by_partner_id
-- stage: tail
-- provenance: {"attnum": 22, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "2cdd128e384407614d54e43a4db0b2fe12052d950ed3ca7c42089656ea3744ea", "oid": 178966, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "2ebd265311126a7b59d241222216f876bad980e7b888058fa9904f5190c9b9e9", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION f722cc6f9d09980104ef464f3527bc7fe7d8b5f9585d9bd13b91b1685984e906
ALTER TABLE public.standalone_invoices ADD COLUMN IF NOT EXISTS paid_by_partner_id uuid;
-- END OPERATION f722cc6f9d09980104ef464f3527bc7fe7d8b5f9585d9bd13b91b1685984e906
