-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:public.idx_card_session_items_transaction_id
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "980c75e556278bc846ad46e771998dba20f5ddbe2f9ee97beb03e255cb4e1773", "live_properties_sha256": "1ce1173a7364e5f6fd22773cf0e0cf8f6f35d988b2e30786475f61199f262e88", "oid": 360139, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "56ae663fcbce6b509859e36cd4a2d460089314b7d59edde10095588575a18576", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION cfd9f0e2e6c72d1833e5b2fee1443221279fa296ff34105e00048e8cf2a82d26
CREATE INDEX IF NOT EXISTS idx_card_session_items_transaction_id ON public.card_session_items USING btree (transaction_id);
-- END OPERATION cfd9f0e2e6c72d1833e5b2fee1443221279fa296ff34105e00048e8cf2a82d26
