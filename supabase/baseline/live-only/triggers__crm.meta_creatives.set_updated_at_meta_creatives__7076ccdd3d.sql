-- #352 G3: local disposable replay only. Never apply to Live.
-- object: triggers:crm.meta_creatives.set_updated_at_meta_creatives
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "a2c97f333ac311a7474ad8ba398ce0e227b04204f753171ae4285866a60d8692", "live_properties_sha256": "e843d9bef88eb67abc144340e4bd0a39255e450d0d91ffa62996d780ec48f94d", "oid": 81490, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "2ae22f32221fc9a65485222c96fd8937e904665cb4aedb660822075b2b9c47da", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 77c99c662305b8767131057af5dabd1931160135ce97077282ae1f54330635e9
CREATE OR REPLACE TRIGGER set_updated_at_meta_creatives BEFORE UPDATE ON crm.meta_creatives FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE crm.meta_creatives ENABLE TRIGGER set_updated_at_meta_creatives;
-- END OPERATION 77c99c662305b8767131057af5dabd1931160135ce97077282ae1f54330635e9
