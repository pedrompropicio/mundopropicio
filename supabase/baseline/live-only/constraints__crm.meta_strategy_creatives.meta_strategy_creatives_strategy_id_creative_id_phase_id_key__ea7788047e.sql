-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:crm.meta_strategy_creatives.meta_strategy_creatives_strategy_id_creative_id_phase_id_key
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "d4b41e78c288293eac13c410621d7581544aa8f3660338b68ab30cc54f65bde7", "live_properties_sha256": "c9d1c5e87968c2df261a3ef50fffe4c2ab74445cf3dee3a8e330cfe737332031", "oid": 81694, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "6773006f20b9a5486bf1b00fa70fc3bbbc50a0fb8ff5511d8cd7de313423e8c5", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION cd200a50f999e42a2a20a786560f561ff8ff5c6933fef965b1bd1e5afec66115
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crm.meta_strategy_creatives'::regclass AND conname='meta_strategy_creatives_strategy_id_creative_id_phase_id_key') THEN
  ALTER TABLE crm.meta_strategy_creatives ADD CONSTRAINT meta_strategy_creatives_strategy_id_creative_id_phase_id_key UNIQUE (strategy_id, creative_id, phase_id);
 END IF;
END $baseline_constraint$;
-- END OPERATION cd200a50f999e42a2a20a786560f561ff8ff5c6933fef965b1bd1e5afec66115
