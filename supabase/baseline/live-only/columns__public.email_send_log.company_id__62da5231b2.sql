-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.email_send_log.company_id
-- stage: reconcile
-- provenance: {"attnum": 9, "live_absence": false, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "e8cb0b4ac8ace05b3b485d25f41d77d2da2f899e54362bbb7d6f7815493b4765", "review": 6445145238, "rule": "nullable_from_live", "source_sql_sha256": "475837e7f70512716dd2dbcd8dd508288d86170bfb1ee797d3c90f7f1f1a9f4c", "window": "after tail, before final ACL"}
-- BEGIN OPERATION b270c7674c6c9ad30ee1b5094bddc79343814bd7f2a1a8662a0de161f00c6a1b
ALTER TABLE public.email_send_log ALTER COLUMN company_id DROP NOT NULL;
-- END OPERATION b270c7674c6c9ad30ee1b5094bddc79343814bd7f2a1a8662a0de161f00c6a1b
