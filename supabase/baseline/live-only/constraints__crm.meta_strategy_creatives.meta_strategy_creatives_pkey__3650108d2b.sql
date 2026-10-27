-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:crm.meta_strategy_creatives.meta_strategy_creatives_pkey
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "8c8464f42472e42ee190fc91ca8db79b5351d3a4609040516578d229c56f6fa5", "live_properties_sha256": "5e005871bc83b037f16c7d42aef17ab73fc244c93c176d4ec68a8dd46aaa07a6", "oid": 81692, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "aa3dc42f92c8f4769b43041d1a6f0e7b49c9c1235148bc7656057baea12558d0", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION f2d724cadccf80e549b88cd3963dc82abbf86c6e155dcaa30b4a25b8b6d8e415
DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='crm.meta_strategy_creatives'::regclass AND conname='meta_strategy_creatives_pkey') THEN
  ALTER TABLE crm.meta_strategy_creatives ADD CONSTRAINT meta_strategy_creatives_pkey PRIMARY KEY (id);
 END IF;
END $baseline_constraint$;
-- END OPERATION f2d724cadccf80e549b88cd3963dc82abbf86c6e155dcaa30b4a25b8b6d8e415
