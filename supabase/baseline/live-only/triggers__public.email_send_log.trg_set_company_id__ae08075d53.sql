-- #352 G3: local disposable replay only. Never apply to Live.
-- object: triggers:public.email_send_log.trg_set_company_id
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "39fb4d6bad803c980a7068ae1f05a994e0718adf1116fea8d98d0b5e112f43c7", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "4d7fbd07255497b4e5a6f82991e77ea030876f6ab65ead13a7fdbeac699272fc", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "ce9a4494d67433e4eb90e0a9201cd32b95439bd457d49c1224b77df1bf42a5b1", "window": "after tail, before final ACL"}
-- BEGIN OPERATION a8d471ae30eb309f05998e38f6b258dc77dd6c7b0248a1b49fab9679c36f1eba
DROP TRIGGER IF EXISTS trg_set_company_id ON public.email_send_log;
-- END OPERATION a8d471ae30eb309f05998e38f6b258dc77dd6c7b0248a1b49fab9679c36f1eba
