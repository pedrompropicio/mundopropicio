-- #352 G3: local disposable replay only. Never apply to Live.
-- object: triggers:public.email_send_log.set_company_id_soft
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "849fb6e00c705b01a5d39dad4e5e10119974cf6c331667abdd53aaffb1d1e522", "live_properties_sha256": "c99795795c587773ca534c65d2c8d2201c0cc0c0a0220df01a1b4adaf858a369", "oid": 180008, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "ca0b17eb342289e1fc65ae71175e43ced9f577ad9959d537dd7177f41cbaeed8", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 169946a5eb7613bbb9f350572aff5f11c05295dabfcdac95c56eeb3c7de30182
CREATE OR REPLACE TRIGGER set_company_id_soft BEFORE INSERT ON email_send_log FOR EACH ROW EXECUTE FUNCTION set_company_id_on_insert_soft();

ALTER TABLE public.email_send_log ENABLE TRIGGER set_company_id_soft;
-- END OPERATION 169946a5eb7613bbb9f350572aff5f11c05295dabfcdac95c56eeb3c7de30182
