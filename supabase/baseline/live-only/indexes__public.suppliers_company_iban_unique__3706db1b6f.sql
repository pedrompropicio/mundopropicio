-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:public.suppliers_company_iban_unique
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "d03c744600ff999ddd1f6275c72286be2c7214dad912baa6be8a3148997d6ba9", "live_properties_sha256": "10c9322c3801d410029f91b6854c1d52974bbd212636a967fc139aad24b94601", "oid": 217059, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "0003ffeacb5b7a21cbcef12dc8a545e264951a035a69466221af9658c991ef88", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION a8e29dd0a963892e5ef0e02d4d1d73861d821c938495896b5647a104b698bb3e
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_iban_unique ON public.suppliers USING btree (company_id, iban) WHERE ((is_active = true) AND (iban IS NOT NULL) AND (iban <> ''::text));
-- END OPERATION a8e29dd0a963892e5ef0e02d4d1d73861d821c938495896b5647a104b698bb3e
