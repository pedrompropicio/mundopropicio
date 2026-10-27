-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:crm.meta_publish_plan.platform
-- stage: tail
-- provenance: {"attnum": 28, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "bca32b56e015131b46b1b86707d5e8e995aea80a57833a99f793cbbc39ec33ca", "oid": 157927, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "05228cba2f47e02f81ee716e54324261dfe41cceec98fc9fe18f0704c809e77a", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION f98748e2a55744505c4f6579ab057a08fe027343b4a9baaa3e2fe737095d5f4e
ALTER TABLE crm.meta_publish_plan ADD COLUMN IF NOT EXISTS platform text DEFAULT 'meta'::text NOT NULL;
-- END OPERATION f98748e2a55744505c4f6579ab057a08fe027343b4a9baaa3e2fe737095d5f4e
