-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:public.suppressed_emails_email_company_key
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "69268e7996649e1345eeede949e9a6346f61c678c932da7d4045e99a5592b3b6", "live_properties_sha256": "f1fd64dab6b89cae4defa8d91f2d77ea63b773219c9c33871498aacca4e3f721", "oid": 187650, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "ae0b75538f3a7c0c193ed6664bc9f588db9ab5b9fcad0b86b8b0497c226def77", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION f376b7239e93b9d645640a80a8a5b4cc65c54d17bffd5ff6a1ec2e475922b9cd
CREATE UNIQUE INDEX IF NOT EXISTS suppressed_emails_email_company_key ON public.suppressed_emails USING btree (email, company_id) NULLS NOT DISTINCT;
-- END OPERATION f376b7239e93b9d645640a80a8a5b4cc65c54d17bffd5ff6a1ec2e475922b9cd
