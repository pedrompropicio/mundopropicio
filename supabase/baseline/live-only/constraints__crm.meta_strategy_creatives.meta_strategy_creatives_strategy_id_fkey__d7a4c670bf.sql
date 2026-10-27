-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:crm.meta_strategy_creatives.meta_strategy_creatives_strategy_id_fkey
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "85eada44674fecf992047264ec1e1c89502e3fe19d62ab5c58503be0c14ad717", "live_properties_sha256": "3785df7324fa25c60d594d7ae487a6489e737ab2b213ca7cbff597f4b7c56aee", "oid": 81695, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "037fec043f592a06314d7312cbd978c64cf14d6fb7e1bed9274c3330ba0a0814", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION daf0019584b186276daa8c1bf194240e33a6df65c4413f7e0df0c82aaf6221c9
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crm.meta_strategy_creatives'::regclass AND conname='meta_strategy_creatives_strategy_id_fkey') THEN
  ALTER TABLE crm.meta_strategy_creatives ADD CONSTRAINT meta_strategy_creatives_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES crm.meta_campaign_strategies(id) ON DELETE CASCADE;
 END IF;
END $baseline_constraint$;
-- END OPERATION daf0019584b186276daa8c1bf194240e33a6df65c4413f7e0df0c82aaf6221c9
