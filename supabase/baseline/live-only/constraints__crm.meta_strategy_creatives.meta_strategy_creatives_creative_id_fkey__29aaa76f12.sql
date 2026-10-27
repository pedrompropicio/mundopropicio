-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:crm.meta_strategy_creatives.meta_strategy_creatives_creative_id_fkey
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "3439c865d04d75d956a2dec5a6c3a3c83967c68fe7247117c84f17d0590bbd42", "live_properties_sha256": "d01c8888225c6dae2edf93fcc29375f912bdda125af9c1bc8abe065dcc6f4568", "oid": 81700, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "a27cb06e82729f25168cd525db9854cd599ce3b2f57e4c62afc6aa535566e8f8", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 7cbf73713d8046d059c0200a8cbd396dd339111e48af496565eb9394c393b28d
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crm.meta_strategy_creatives'::regclass AND conname='meta_strategy_creatives_creative_id_fkey') THEN
  ALTER TABLE crm.meta_strategy_creatives ADD CONSTRAINT meta_strategy_creatives_creative_id_fkey FOREIGN KEY (creative_id) REFERENCES crm.meta_creatives(id) ON DELETE CASCADE;
 END IF;
END $baseline_constraint$;
-- END OPERATION 7cbf73713d8046d059c0200a8cbd396dd339111e48af496565eb9394c393b28d
