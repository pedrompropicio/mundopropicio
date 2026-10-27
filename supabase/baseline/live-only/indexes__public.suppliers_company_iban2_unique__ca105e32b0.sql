-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:public.suppliers_company_iban2_unique
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "cad7d49c36d3cddc8289e69c53406a35b7a11d56d4492fa4c0946f307c9a37ed", "live_properties_sha256": "7b3a684eb1e8af02ca584a7a54cd9182947948f63067e911202feee34b5f92d2", "oid": 217060, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "24059784d61b9fd0bd9c7793a81557b0a00d8effce17c169d44682b87a4d6279", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 70b09969548718e66738aa4b165e5a341d170eeadaa39f4c4f62fc540fbac544
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_iban2_unique ON public.suppliers USING btree (company_id, iban_2) WHERE ((is_active = true) AND (iban_2 IS NOT NULL) AND (iban_2 <> ''::text));
-- END OPERATION 70b09969548718e66738aa4b165e5a341d170eeadaa39f4c4f62fc540fbac544
