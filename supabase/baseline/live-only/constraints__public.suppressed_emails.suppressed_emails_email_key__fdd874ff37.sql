-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.suppressed_emails.suppressed_emails_email_key
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "d7d9656e2ba32218947dbea1a59faa0c8dee2bf241beb17f86afdf297eec8ac0", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "752842993c9ac6a85338cf06cc158c57c8cc7992cee89884ae91bd52b38a8e7b", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "6a3254fe2280563f9ed03e3ab6046f3c18fd2c7ec92ff247e9cea8b8cb067a62", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 6889090092919361d06cdf425028f85656d95427bdec8c4fb47b8e26b87399e6
ALTER TABLE public.suppressed_emails DROP CONSTRAINT IF EXISTS suppressed_emails_email_key;
-- END OPERATION 6889090092919361d06cdf425028f85656d95427bdec8c4fb47b8e26b87399e6
