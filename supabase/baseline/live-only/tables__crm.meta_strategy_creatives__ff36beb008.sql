-- #352 G3: local disposable replay only. Never apply to Live.
-- object: tables:crm.meta_strategy_creatives
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "2591a131777674445812f202925c40d3af7ee4acb7a275ea6861da27c74cdb80", "oid": 81683, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "66be412beadd359cb979eb0d6a341c93104cd5f83b14f9dc28549798efad3b70", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION a2fc08613bd82b591e581589d74096004acee262a86f239b4b9b6e2eed5d90ad
CREATE TABLE IF NOT EXISTS "crm"."meta_strategy_creatives" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"company_id" uuid NOT NULL,
"strategy_id" uuid NOT NULL,
"creative_id" uuid NOT NULL,
"phase_id" text,
"position" integer DEFAULT 0 NOT NULL,
"created_by" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "crm"."meta_strategy_creatives" OWNER TO "postgres";

ALTER TABLE "crm"."meta_strategy_creatives" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "crm"."meta_strategy_creatives" NO FORCE ROW LEVEL SECURITY;
-- END OPERATION a2fc08613bd82b591e581589d74096004acee262a86f239b4b9b6e2eed5d90ad
