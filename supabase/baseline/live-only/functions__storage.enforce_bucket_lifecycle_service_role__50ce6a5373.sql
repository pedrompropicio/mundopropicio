-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:storage.enforce_bucket_lifecycle_service_role()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "1cb7aecc95a27f8600fc8e7aab11f6a40b9b46a5cb86e02438f3af9642a0d2c4", "live_properties_sha256": "885be07c1580649abf2d4ba3ae3012752ab5a9d6107ef8f8e5d56522cee81f51", "oid": 249017, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "4a2d19959f3fde7a07f17206def6e6047c21d22f518cc3830643da91fab1d600", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 9d403b817f80023bb834a884813cb31ea1c7483f6d1684b56b82d5aa292031bf
CREATE OR REPLACE FUNCTION storage.enforce_bucket_lifecycle_service_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF current_user::text IS DISTINCT FROM TG_ARGV[0]
     AND (
       OLD.lifecycle_configuration IS DISTINCT FROM NEW.lifecycle_configuration
       OR OLD.lifecycle_configuration_generation IS DISTINCT FROM NEW.lifecycle_configuration_generation
     ) THEN
    -- AFTER runs only after caller RLS has accepted the proposed row. The API
    -- recognizes this specific error after rolling back its permission probe;
    -- direct non-service writes still fail and cannot persist the change.
    RAISE EXCEPTION 'bucket control columns may only be changed by the configured storage service role'
      USING ERRCODE = 'PST01',
            SCHEMA = TG_TABLE_SCHEMA,
            TABLE = TG_TABLE_NAME,
            CONSTRAINT = TG_NAME;
  END IF;

  RETURN NULL;
END;
$function$
;

ALTER FUNCTION storage.enforce_bucket_lifecycle_service_role() OWNER TO supabase_storage_admin;
-- END OPERATION 9d403b817f80023bb834a884813cb31ea1c7483f6d1684b56b82d5aa292031bf
