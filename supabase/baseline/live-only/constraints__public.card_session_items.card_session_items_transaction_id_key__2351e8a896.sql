-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.card_session_items.card_session_items_transaction_id_key
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "26b4ba841094dfa51b088eefc9f5d07a364526bb0282d27f44461e8f30319d16", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "648f8d8efebcd1a4594179aaf99cf9d6bec957c1688538bb1ce85ee30d6f3605", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "026a863f9be0cb532ea874f72eabd47fc878b845937ba5cc323a5b2135fef153", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 2faddc49468314fb77af4df9bb9240f65dccdcb1ed87559c00a51ff97a60d24c
ALTER TABLE public.card_session_items DROP CONSTRAINT IF EXISTS card_session_items_transaction_id_key;
-- END OPERATION 2faddc49468314fb77af4df9bb9240f65dccdcb1ed87559c00a51ff97a60d24c
