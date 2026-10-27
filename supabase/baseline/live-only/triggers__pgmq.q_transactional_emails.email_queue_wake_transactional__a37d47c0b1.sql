-- #352 G3: local disposable replay only. Never apply to Live.
-- object: triggers:pgmq.q_transactional_emails.email_queue_wake_transactional
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "dab35ca3bc63a9bc9919d57ffde283343653e47a283c192fc4beb27b638bbbbc", "live_properties_sha256": "a8f6618f20bb2f9e85974529418b19a952b25cc7a927d99b8e0fb8e9b3f8303a", "oid": 660280, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "7f266fcd33eeee166b21d0905d13c54b1350ac3d2047187b13e1c834783492ed", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION b97bad303c3e5a4ad661d9f4f40981d3aab30c4008f92d69ab7bbee30ebc3a42
CREATE OR REPLACE TRIGGER email_queue_wake_transactional AFTER INSERT ON pgmq.q_transactional_emails FOR EACH STATEMENT EXECUTE FUNCTION email_queue_wake();

ALTER TABLE pgmq.q_transactional_emails ENABLE TRIGGER email_queue_wake_transactional;
-- END OPERATION b97bad303c3e5a4ad661d9f4f40981d3aab30c4008f92d69ab7bbee30ebc3a42
