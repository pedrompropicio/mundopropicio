-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:public.email_unsubscribe_tokens_email_company_key
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "459e07b79466c47efd57f06cd0b4799d934e1ca9800d8e74bcdeca270ed82941", "live_properties_sha256": "19e3cf56e5e36bfd46d5f38a167fc4e44f906a7d0581e99c87ccec0f4decc3d5", "oid": 187651, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "c6619937fbb95c83b4be9d105ee962eb4ef0817b45a174fd8aa45b773a8491a7", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 28307b305cc62278ffb41119793912ab568fcc96923ba25e98d42a1357f60a76
CREATE UNIQUE INDEX IF NOT EXISTS email_unsubscribe_tokens_email_company_key ON public.email_unsubscribe_tokens USING btree (email, company_id) NULLS NOT DISTINCT;
-- END OPERATION 28307b305cc62278ffb41119793912ab568fcc96923ba25e98d42a1357f60a76
