-- #352 G3: local disposable replay only. Never apply to Live.
-- object: triggers:storage.buckets.protect_bucket_control_insert
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "9c4f45c4c979edd35a555fbc3f8fff288f6e51798a873c5979609f81357eff48", "live_properties_sha256": "ecc484b7025284f94720994c1e9b7602838c3e32123ad33328efe6e1fa57ee15", "oid": 249018, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "a26e809f4514d3384f0255c094c321b5ebd036c3ee4dac7832d4c317a3779d81", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION f612ee0fe3264e21987f73b63ef73c0dca3779c746768bdc2e408989c24f6c00
CREATE OR REPLACE TRIGGER protect_bucket_control_insert BEFORE INSERT ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_bucket_control_columns('service_role');

ALTER TABLE storage.buckets ENABLE TRIGGER protect_bucket_control_insert;
-- END OPERATION f612ee0fe3264e21987f73b63ef73c0dca3779c746768bdc2e408989c24f6c00
