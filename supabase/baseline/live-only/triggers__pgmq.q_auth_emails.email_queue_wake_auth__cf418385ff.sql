-- #352 G3: local disposable replay only. Never apply to Live.
-- object: triggers:pgmq.q_auth_emails.email_queue_wake_auth
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "cc4cdbd2eb82cfbda35d2ce3258b2a731e903478e3315299fa2d2d9f587d2906", "live_properties_sha256": "0878abc6c23e0bc056fe0c4272a14a96019102c9ecb0b20cdad400dfdf1fd1dc", "oid": 660279, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "58fe8398cf0ec53827a3562ea1051e29f2e947ca51571b9344f5514346e9dc7b", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 2a29c19dba71fdc6d6aabfce429ca3f64801374ca830371a67ef519b450c0197
CREATE OR REPLACE TRIGGER email_queue_wake_auth AFTER INSERT ON pgmq.q_auth_emails FOR EACH STATEMENT EXECUTE FUNCTION email_queue_wake();

ALTER TABLE pgmq.q_auth_emails ENABLE TRIGGER email_queue_wake_auth;
-- END OPERATION 2a29c19dba71fdc6d6aabfce429ca3f64801374ca830371a67ef519b450c0197
