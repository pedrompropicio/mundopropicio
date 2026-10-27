-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:storage.objects.archived_at
-- stage: tail
-- provenance: {"attnum": 13, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "31f3d43e5158edbc9d5f69c105a470261adb842af88650cb2ff0e5fdeacacfc1", "oid": 17221, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "f6e82b2bf9f05021db454356a149ed85ec31ce6b80cc7f8b60544729442c8510", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 697f785f10c22cadcceb9f126b4e6e69c21b0f66d64c8eeae96f5d760391fbd4
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;
-- END OPERATION 697f785f10c22cadcceb9f126b4e6e69c21b0f66d64c8eeae96f5d760391fbd4
