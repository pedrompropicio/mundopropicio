-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.email_unsubscribe_tokens.email_unsubscribe_tokens_email_key
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "93725e8edd86dae40086c138cca1be473199b6608f101f793dc922dbcdc54593", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "a55e9b0a9c71ea30e3a3aed2ed32989e6516b6e1a399889adb70d2fc9fe049c9", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "fcc9e60285b3ea4e941d76681a67c91e3cc5405a7f3e86f58be62d90f3631b02", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 7a31cf41b3bab3b442091e54a8745f05cf1366e208562284fb236345c844ac9e
ALTER TABLE public.email_unsubscribe_tokens DROP CONSTRAINT IF EXISTS email_unsubscribe_tokens_email_key;
-- END OPERATION 7a31cf41b3bab3b442091e54a8745f05cf1366e208562284fb236345c844ac9e
