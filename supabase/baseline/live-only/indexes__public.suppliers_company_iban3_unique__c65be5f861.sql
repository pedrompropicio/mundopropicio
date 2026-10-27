-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:public.suppliers_company_iban3_unique
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "c6907953a1c7c6cee879b964870b86c74baa75064e3ea9863804b1baf2b07d74", "live_properties_sha256": "12cbfec2188d57bcfde74d18e33313226d4cffd887bc95520a47237f2fbefa5b", "oid": 217061, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "02208c638f240c8e7d01689cb2560bd5e3a923e516de930f027c68677c75c0ae", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 0c3ac79553cae9b90efc386c9c23ae7c1079d78d06a913e0c7f9a4faead49260
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_iban3_unique ON public.suppliers USING btree (company_id, iban_3) WHERE ((is_active = true) AND (iban_3 IS NOT NULL) AND (iban_3 <> ''::text));
-- END OPERATION 0c3ac79553cae9b90efc386c9c23ae7c1079d78d06a913e0c7f9a4faead49260
